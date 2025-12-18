-- =====================================================
-- Migration: Create Branch Transfers System
-- Description: Sistem transfer antar cabang (stock, cash, assets)
-- =====================================================

-- Create branch_transfers table
CREATE TABLE IF NOT EXISTS public.branch_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_branch_id UUID REFERENCES public.branches(id) NOT NULL,
  from_branch_name TEXT NOT NULL,
  to_branch_id UUID REFERENCES public.branches(id) NOT NULL,
  to_branch_name TEXT NOT NULL,
  transfer_type TEXT NOT NULL CHECK (transfer_type IN ('stock', 'cash', 'asset')),
  items JSONB, -- For stock transfers (array of items)
  amount NUMERIC, -- For cash transfers
  account_id TEXT REFERENCES public.accounts(id), -- For cash transfers
  asset_id TEXT, -- For asset transfers (assets.id is TEXT type, not UUID)
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  requested_by UUID REFERENCES public.profiles(id) NOT NULL,
  requested_by_name TEXT NOT NULL,
  approved_by UUID REFERENCES public.profiles(id),
  approved_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE public.branch_transfers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view branch transfers"
  ON public.branch_transfers FOR SELECT
  USING (
    -- Can see if involved in from or to branch
    can_access_branch(from_branch_id)
    OR can_access_branch(to_branch_id)
  );

CREATE POLICY "Users can create branch transfers"
  ON public.branch_transfers FOR INSERT
  WITH CHECK (
    from_branch_id = get_user_branch_id()
  );

CREATE POLICY "Users can update branch transfers"
  ON public.branch_transfers FOR UPDATE
  USING (
    -- Requester can edit pending transfers
    (status = 'pending' AND requested_by = auth.uid())
    OR
    -- Target branch can approve/reject
    (status = 'pending' AND can_access_branch(to_branch_id))
    OR
    -- Head office can do anything
    is_head_office_user()
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_branch_transfers_from_branch ON public.branch_transfers(from_branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_transfers_to_branch ON public.branch_transfers(to_branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_transfers_status ON public.branch_transfers(status);
CREATE INDEX IF NOT EXISTS idx_branch_transfers_type ON public.branch_transfers(transfer_type);
CREATE INDEX IF NOT EXISTS idx_branch_transfers_requested_by ON public.branch_transfers(requested_by);

-- Updated at trigger
CREATE OR REPLACE FUNCTION public.update_branch_transfers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER branch_transfers_updated_at
  BEFORE UPDATE ON public.branch_transfers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_branch_transfers_updated_at();

-- Function to approve and execute transfer
CREATE OR REPLACE FUNCTION public.approve_branch_transfer(
  transfer_id UUID,
  approver_id UUID,
  approver_name TEXT
)
RETURNS void AS $$
DECLARE
  transfer_record RECORD;
  item JSONB;
BEGIN
  -- Get transfer record
  SELECT * INTO transfer_record
  FROM public.branch_transfers
  WHERE id = transfer_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found or already processed';
  END IF;

  -- Update transfer status
  UPDATE public.branch_transfers
  SET
    status = 'approved',
    approved_by = approver_id,
    approved_by_name = approver_name,
    completed_at = NOW()
  WHERE id = transfer_id;

  -- Execute transfer based on type
  IF transfer_record.transfer_type = 'stock' THEN
    -- Process stock transfer
    FOR item IN SELECT * FROM jsonb_array_elements(transfer_record.items)
    LOOP
      IF item->>'materialId' IS NOT NULL THEN
        -- Transfer material stock
        -- Deduct from source branch
        INSERT INTO public.material_stock_movements (
          material_id, quantity, type, branch_id, notes, created_at
        ) VALUES (
          (item->>'materialId')::UUID,
          -(item->>'quantity')::NUMERIC,
          'Keluar',
          transfer_record.from_branch_id,
          'Transfer ke ' || transfer_record.to_branch_name || ' - ' || COALESCE(transfer_record.notes, ''),
          NOW()
        );

        -- Add to destination branch
        INSERT INTO public.material_stock_movements (
          material_id, quantity, type, branch_id, notes, created_at
        ) VALUES (
          (item->>'materialId')::UUID,
          (item->>'quantity')::NUMERIC,
          'Masuk',
          transfer_record.to_branch_id,
          'Transfer dari ' || transfer_record.from_branch_name || ' - ' || COALESCE(transfer_record.notes, ''),
          NOW()
        );
      END IF;
    END LOOP;

  ELSIF transfer_record.transfer_type = 'cash' THEN
    -- Process cash transfer
    -- Deduct from source branch
    INSERT INTO public.cash_history (
      account_id, amount, type, description, branch_id, date
    ) VALUES (
      transfer_record.account_id,
      -transfer_record.amount,
      'Keluar',
      'Transfer ke ' || transfer_record.to_branch_name || ' - ' || COALESCE(transfer_record.notes, ''),
      transfer_record.from_branch_id,
      NOW()
    );

    -- Add to destination branch
    INSERT INTO public.cash_history (
      account_id, amount, type, description, branch_id, date
    ) VALUES (
      transfer_record.account_id,
      transfer_record.amount,
      'Masuk',
      'Transfer dari ' || transfer_record.from_branch_name || ' - ' || COALESCE(transfer_record.notes, ''),
      transfer_record.to_branch_id,
      NOW()
    );

  ELSIF transfer_record.transfer_type = 'asset' THEN
    -- Process asset transfer
    UPDATE public.assets
    SET branch_id = transfer_record.to_branch_id
    WHERE id = transfer_record.asset_id;
  END IF;

  -- Mark as completed
  UPDATE public.branch_transfers
  SET status = 'completed'
  WHERE id = transfer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reject transfer
CREATE OR REPLACE FUNCTION public.reject_branch_transfer(
  transfer_id UUID,
  approver_id UUID,
  approver_name TEXT
)
RETURNS void AS $$
BEGIN
  UPDATE public.branch_transfers
  SET
    status = 'rejected',
    approved_by = approver_id,
    approved_by_name = approver_name,
    completed_at = NOW()
  WHERE id = transfer_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found or already processed';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.branch_transfers IS 'Tabel untuk tracking transfer antar cabang';
COMMENT ON FUNCTION public.approve_branch_transfer IS 'Approve dan execute transfer antar cabang';
COMMENT ON FUNCTION public.reject_branch_transfer IS 'Reject transfer antar cabang';
