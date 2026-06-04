CREATE OR REPLACE FUNCTION fn_grant_packs(
  p_user_id uuid,
  p_amount integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id uuid;
  v_editor_company_id uuid;
  v_max_accumulated integer;
  v_current_packs integer;
  v_new_packs integer;
BEGIN
  -- 1. Obtener la empresa del usuario que llama (editor)
  SELECT company_id INTO v_editor_company_id
  FROM public.user_profiles
  WHERE id = auth.uid() AND role = 'editor';

  IF v_editor_company_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado. Solo los editores pueden otorgar sobres.';
  END IF;

  -- 2. Obtener la empresa del empleado destino y validar pertenencia
  SELECT company_id INTO v_company_id
  FROM public.user_profiles
  WHERE id = p_user_id AND role = 'employee';

  IF v_company_id IS NULL OR v_company_id <> v_editor_company_id THEN
    RAISE EXCEPTION 'El empleado no pertenece a tu empresa o no es válido.';
  END IF;

  -- 3. Obtener el max_accumulated de la empresa
  SELECT max_accumulated INTO v_max_accumulated
  FROM public.pack_config
  WHERE company_id = v_company_id;

  IF v_max_accumulated IS NULL THEN
    v_max_accumulated := 5; -- default fallback
  END IF;

  -- 4. Obtener sobres actuales del empleado
  SELECT packs_available INTO v_current_packs
  FROM public.user_pack_status
  WHERE user_id = p_user_id AND company_id = v_company_id;

  IF v_current_packs IS NULL THEN
    INSERT INTO public.user_pack_status (user_id, company_id, packs_available)
    VALUES (p_user_id, v_company_id, 0)
    RETURNING packs_available INTO v_current_packs;
  END IF;

  -- 5. Calcular nuevo valor respetando max_accumulated
  v_new_packs := v_current_packs + p_amount;
  IF v_new_packs > v_max_accumulated THEN
    v_new_packs := v_max_accumulated;
  END IF;

  -- 6. Actualizar y retornar
  UPDATE public.user_pack_status
  SET packs_available = v_new_packs,
      updated_at = now()
  WHERE user_id = p_user_id AND company_id = v_company_id;

  RETURN v_new_packs;
END;
$$;
