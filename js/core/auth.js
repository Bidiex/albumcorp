import { supabase } from './supabase.js';

/**
 * Registra un nuevo editor y crea su empresa
 */
export async function registerEditor(editorName, companyName, email, password) {
  // 1. Registrar usuario con metadata inicial
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        role: 'editor',
        display_name: editorName
      }
    }
  });

  if (authError) throw authError;

  // 2. Usar RPC para crear empresa y actualizar perfil de forma segura
  const { data: rpcData, error: rpcError } = await supabase.rpc('fn_register_editor', {
    p_company_name: companyName,
    p_editor_name: editorName,
    p_user_id: authData.user.id
  });

  if (rpcError) throw rpcError;

  return { user: authData.user, company: rpcData };
}

/**
 * Inicia sesión y verifica estado de paquetes
 */
export async function loginUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;

  const profile = await getCurrentProfile();
  
  if (profile) {
    const { error: rpcError } = await supabase.rpc('fn_login_pack_check', {
      p_user_id: data.user.id,
      p_company_id: profile.company_id
    });
    if (rpcError) console.error('Error en fn_login_pack_check:', rpcError);
  }

  return data;
}

/**
 * Cierra sesión y redirige
 */
export async function logoutUser() {
  await supabase.auth.signOut();
  window.location.href = '/index.html';
}

/**
 * Obtiene la sesión activa
 */
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/**
 * Obtiene el perfil del usuario actual
 */
export async function getCurrentProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) return null;
  return data;
}

/**
 * Protege rutas basado en roles
 */
export async function guardRoute(allowedRoles = []) {
  const session = await getSession();
  if (!session) {
    window.location.href = '/index.html';
    return null;
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    window.location.href = '/index.html';
    return null;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(profile.role)) {
    window.location.href = '/album.html';
    return null;
  }

  return profile;
}
