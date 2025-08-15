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
    const { email, password, full_name, username, role, phone, address, status } = await req.json()

    if (!email || !password || !full_name || !role) {
      throw new Error("Email, password, full name, and role are required.")
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Step 1: Create the user in auth.users
    // All profile data is passed in user_metadata to be handled by the handle_new_user trigger
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name,
        username, // Pass username to user_metadata
        role,
        phone,    // Pass phone to user_metadata
        address,  // Pass address to user_metadata
        status,   // Pass status to user_metadata
      }
    })

    if (authError) {
      throw authError
    }

    if (!authData.user) {
        throw new Error("User creation failed, user data not returned.")
    }

    // The profile creation in public.profiles is now handled by the 'handle_new_user' trigger
    // which fires automatically after a new user is created in auth.users.

    return new Response(JSON.stringify({ user: authData.user }), {
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