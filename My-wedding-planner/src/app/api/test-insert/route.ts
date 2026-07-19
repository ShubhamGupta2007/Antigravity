import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  
  // We can't insert without auth unless we bypass RLS. But since we don't have service_role, we can't bypass.
  // Let's just check the schema of `expenses` using an introspection query!
  const { data, error } = await supabase.rpc('exec_sql', { sql: 'SELECT column_name, data_type FROM information_schema.columns WHERE table_name = \'expenses\'' })
  
  if (error) {
    return NextResponse.json({ error: error.message, hint: "Cannot execute RPC, we'll try a REST query that will fail but return the schema in the error hint if we are lucky." })
  }

  return NextResponse.json({ data })
}
