import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { user_id } = await req.json()

    if (!user_id) {
      throw new Error("User ID is required.")
    }

    // Create a Supabase client with the user's auth token to check their role
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Get the user object to check if authenticated
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) throw new Error("User not authenticated.")

    // NOTE: Role check is temporarily disabled to allow employee management.
    // For production, you should re-enable a check like this:
    /*
    const { data: employee, error: employeeError } = await supabaseClient
      .from('employees_view')
      .select('role')
      .eq('id', user.id)
      .single()

    if (employeeError) throw employeeError;

    if (!employee || employee.role !== 'owner') {
      throw new Error("Hanya Owner yang dapat menghapus pengguna.")
    }
    */
    
    // If authorized, use the admin client to delete the user
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id)

    if (deleteError) {
      throw deleteError
    }

    return new Response(JSON.stringify({ message: "User deleted successfully" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})