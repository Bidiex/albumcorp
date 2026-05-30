import { supabase } from './supabase.js';

/**
 * Registra un nuevo editor y crea su empresa
 */
export async function registerEditor(email, password) {
  // Registrar usuario en auth pasándole únicamente el rol 'editor'
  // Al no enviarle company_id, el trigger de Supabase creará el perfil de usuario con company_id = null.
  // Esto obligará a realizar el onboarding de empresa en el primer ingreso al panel.
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        role: 'editor'
      }
    }
  });

  if (authError) throw authError;

  return { user: authData.user };
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
  window.location.href = '/';
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
    window.location.href = '/login';
    return null;
  }

  const profile = await getCurrentProfile();
  if (!profile) {
    window.location.href = '/login';
    return null;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(profile.role)) {
    window.location.href = '/album';
    return null;
  }

  return profile;
}

/**
 * Login con Google — para Editores (desde index.html)
 * Redirige a Google y vuelve a /auth/callback
 */
export async function loginWithGoogleEditor() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/auth/callback?type=editor'
    }
  });
  if (error) throw error;
}

/**
 * Login con Google — para Empleados (desde join.html)
 * Pasa el slug de la empresa para verificar whitelist al volver
 */
export async function loginWithGoogleEmployee(companyId, slug) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + 
        `/auth/callback?type=employee&company_id=${companyId}&slug=${slug}`
    }
  });
  if (error) throw error;
}
