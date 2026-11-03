-- BodegaControl | Datos de DEMOSTRACIÓN con historial de 30 días.
-- Alternativa a 02_datos_iniciales.sql para el entorno de demostración (Neon): se ejecuta sobre una base
-- recién creada con 01_esquema.sql, EN LUGAR de 02 (no después).
--
-- Por qué existe: 02 registra el stock inicial (ALTA) con la fecha de hoy y el libro de movimientos es
-- inmutable; cargar ventas pasadas sobre esa base dejaría ventas anteriores al alta del producto.
-- Aquí el alta se fecha 31 días atrás y luego se simulan 30 días de operación hasta ayer.
--
-- Todo se inserta por las mismas tablas, restricciones y triggers que usa la API: el stock solo cambia
-- con movimientos, cada venta queda completa (detalle, pago y salidas) y nunca hay stock negativo.
-- Los datos son ficticios y están marcados: referencias de pago «DEMO-…» y comprobantes «DEMO-…».
-- Es reproducible: la semilla fija genera siempre el mismo historial (las fechas son relativas a hoy).
--
-- Credenciales (las mismas de 02, más el cajero Ernesto):
--   PROPIETARIO cadionicio@gmail.com / Propietario2026
--   CAJERO      giancarlo@uni.pe     / Cajero2026
--   CAJERO      ernesto@uni.pe       / Ernesto2026
BEGIN;
SET LOCAL search_path = bc;

DO $$
DECLARE
    -- Parámetros de la simulación.
    c_dias        CONSTANT INTEGER := 30;                       -- días de historial (hasta ayer)
    c_zona        CONSTANT TEXT    := 'America/Lima';
    hoy           DATE := (NOW() AT TIME ZONE c_zona)::DATE;
    inicio        DATE := hoy - (c_dias + 1);                   -- día del alta del catálogo

    v_propietario BIGINT;
    v_cajeros     BIGINT[];
    v_dia         DATE;
    v_hora        TIMESTAMPTZ;
    v_ventas_dia  INTEGER;
    v_venta       BIGINT;
    v_detalle     BIGINT;
    v_usuario     BIGINT;
    v_cliente     BIGINT;
    v_clave       UUID;
    v_total       NUMERIC(14,2);
    v_lineas      INTEGER;
    v_metodo      TEXT;
    v_recibido    NUMERIC(14,2);
    v_ref_n       INTEGER := 0;
    v_fact_n      INTEGER := 100;
    p             RECORD;
    v_cant        INTEGER;
    v_saldo       INTEGER;
    v_elegidos    BIGINT[];
BEGIN
    PERFORM SETSEED(0.42);  -- reproducible

    IF EXISTS (SELECT 1 FROM usuario) OR EXISTS (SELECT 1 FROM producto) THEN
        RAISE EXCEPTION 'La base ya tiene datos: ejecute este script sobre una base recién creada con 01_esquema.sql';
    END IF;

    -- ───── Usuarios (hashes bcrypt reales, costo 12) ─────
    INSERT INTO usuario (rol_id, nombre, correo, contrasena_hash, creado_en)
    SELECT r.rol_id, u.nombre, u.correo, u.hash, (inicio + TIME '06:00') AT TIME ZONE c_zona
    FROM (VALUES
        ('PROPIETARIO', 'Cesar Dionicio',    'cadionicio@gmail.com', '$2b$12$ILayIj0ExlAmy4WLKxlaLeA7omYZtXgQusVDonCLckMmzsuiNeDmq'),
        ('CAJERO',      'Giancarlo Aguirre', 'giancarlo@uni.pe',     '$2b$12$Q2aZ/r8RdhJQvo4gwR.51e67hfAHfmwY6nGaQvSgpssp0ItYXuGTm'),
        ('CAJERO',      'Ernesto Salazar',   'ernesto@uni.pe',       '$2b$12$FC3pYZJOOjXqsX7kdUP.QO6Xa36oB11uA2ogmZOMW1DhHNspmDLuS')
    ) AS u(rol, nombre, correo, hash)
    JOIN rol r ON r.codigo = u.rol;

    SELECT usuario_id INTO v_propietario FROM usuario WHERE correo = 'cadionicio@gmail.com';
    SELECT ARRAY_AGG(usuario_id ORDER BY usuario_id) INTO v_cajeros FROM usuario;  -- los tres venden

    -- ───── Catálogo (mismo de 02) con stock objetivo de reposición ─────
    CREATE TEMP TABLE plan_producto (codigo TEXT PRIMARY KEY, objetivo INTEGER, peso INTEGER,
                                     cant_max INTEGER, diario BOOLEAN) ON COMMIT DROP;
    -- peso = qué tan seguido se vende; diario = se repone cada mañana (pan del día).
    INSERT INTO plan_producto VALUES
        ('P0001', 48, 22, 3, FALSE), ('P0002', 36, 16, 3, FALSE), ('P0003', 30, 8, 2, FALSE),
        ('P0004', 52, 18, 2, FALSE), ('P0005', 18, 4, 1, FALSE), ('P0006', 24, 7, 2, FALSE),
        ('P0007', 12, 5, 1, FALSE), ('P0008', 60, 20, 10, TRUE);

    INSERT INTO producto (codigo, nombre, precio, costo, stock_minimo, creado_en, actualizado_en)
    SELECT d.codigo, d.nombre, d.precio, d.costo, d.minimo,
           (inicio + TIME '06:00') AT TIME ZONE c_zona, (inicio + TIME '06:00') AT TIME ZONE c_zona
    FROM (VALUES
        ('P0001', 'Coca-Cola 500 ml', 3.50, 2.60, 10), ('P0002', 'Inca Kola 500 ml', 3.50, 2.60, 10),
        ('P0003', 'Galletas Ritz 6 und.', 4.20, 3.10, 10), ('P0004', 'Leche Gloria 1 L', 4.80, 3.90, 12),
        ('P0005', 'Arroz Costeño 5 kg', 24.90, 21.50, 5), ('P0006', 'Azúcar rubia 1 kg', 4.50, 3.70, 6),
        ('P0007', 'Aceite Primor 1 L', 11.90, 9.80, 4), ('P0008', 'Pan francés (unidad)', 0.30, NULL, 20)
    ) AS d(codigo, nombre, precio, costo, minimo);
    PERFORM SETVAL('producto_codigo_seq', (SELECT MAX(SUBSTRING(codigo FROM 2)::INTEGER) FROM producto));

    -- Stock inicial trazado desde el primer día.
    INSERT INTO movimiento_inventario (producto_id, usuario_id, tipo, cantidad, registrada_en)
    SELECT pr.producto_id, v_propietario, 'ALTA', pl.objetivo, (inicio + TIME '06:30') AT TIME ZONE c_zona
    FROM producto pr JOIN plan_producto pl USING (codigo);

    -- ───── Clientes frecuentes (ficticios, con DNI de formato válido) ─────
    INSERT INTO cliente (tipo_documento, numero_documento, nombre, telefono, creado_en)
    SELECT 'DNI', c.dni, c.nombre, c.telefono, (inicio + TIME '07:00') AT TIME ZONE c_zona
    FROM (VALUES ('40112233', 'Rosa Huamán', '987111222'), ('41223344', 'Luis Quispe', '987333444'),
                 ('42334455', 'Carmen Flores', NULL), ('43445566', 'Jorge Mendoza', '986555666'),
                 ('44556677', 'Ana Torres', NULL), ('45667788', 'Pedro Ccori', '985777888')) AS c(dni, nombre, telefono);

    -- ───── Un día de operación tras otro, en orden cronológico ─────
    FOR v_dia IN SELECT GENERATE_SERIES(inicio + 1, hoy - 1, INTERVAL '1 day')::DATE LOOP

        -- Reposición de la mañana: pan cada día; el resto cuando baja al stock mínimo o menos.
        FOR p IN SELECT pr.producto_id, pr.stock_minimo, pl.objetivo, pl.diario, s.cantidad AS saldo
                 FROM producto pr JOIN plan_producto pl USING (codigo) JOIN inventario_saldo s USING (producto_id)
                 ORDER BY pr.producto_id LOOP
            IF p.objetivo > p.saldo AND (p.diario OR p.saldo <= p.stock_minimo) THEN
                v_fact_n := v_fact_n + 1;
                INSERT INTO movimiento_inventario (producto_id, usuario_id, tipo, cantidad, tipo_comprobante,
                                                   referencia, registrada_en)
                VALUES (p.producto_id, v_propietario, 'ENTRADA', p.objetivo - p.saldo,
                        CASE WHEN p.diario THEN 'SIN_COMPROBANTE' ELSE 'FACTURA' END,
                        CASE WHEN p.diario THEN NULL ELSE 'DEMO-F001-' || v_fact_n END,
                        (v_dia + TIME '07:15' + (p.producto_id || ' minutes')::INTERVAL) AT TIME ZONE c_zona);
            END IF;
        END LOOP;

        -- Más movimiento los fines de semana.
        v_ventas_dia := CASE WHEN EXTRACT(ISODOW FROM v_dia) >= 6 THEN 10 + FLOOR(RANDOM() * 7)
                             ELSE 6 + FLOOR(RANDOM() * 6) END;

        FOR i IN 1..v_ventas_dia LOOP
            -- Hora entre 07:30 y 21:30, creciente dentro del día para mantener el orden cronológico.
            v_hora := (v_dia + TIME '07:30' + ((i - 1 + RANDOM()) * (840.0 / v_ventas_dia) || ' minutes')::INTERVAL)
                      AT TIME ZONE c_zona;
            v_usuario := v_cajeros[1 + FLOOR(RANDOM() * ARRAY_LENGTH(v_cajeros, 1))::INTEGER];
            v_cliente := CASE WHEN RANDOM() < 0.25
                              THEN (SELECT cliente_id FROM cliente ORDER BY RANDOM() LIMIT 1) END;
            v_clave := GEN_RANDOM_UUID();

            -- Elige de 1 a 4 productos distintos, ponderados por su frecuencia de venta.
            SELECT ARRAY_AGG(producto_id) INTO v_elegidos FROM (
                SELECT pr.producto_id FROM producto pr JOIN plan_producto pl USING (codigo)
                ORDER BY -LN(RANDOM()) / pl.peso LIMIT 1 + FLOOR(RANDOM() * 4)::INTEGER) x;

            INSERT INTO venta (usuario_id, cliente_id, clave_idempotencia, solicitud_firma, registrada_en)
            VALUES (v_usuario, v_cliente, v_clave, ENCODE(SHA256(CONVERT_TO(v_clave::TEXT, 'UTF8')), 'hex'), v_hora)
            RETURNING venta_id INTO v_venta;

            v_total := 0; v_lineas := 0;
            FOR p IN SELECT pr.producto_id, pr.precio, pr.costo, pl.cant_max, s.cantidad AS saldo
                     FROM producto pr JOIN plan_producto pl USING (codigo) JOIN inventario_saldo s USING (producto_id)
                     WHERE pr.producto_id = ANY (v_elegidos) ORDER BY pr.producto_id LOOP
                -- Nunca se vende más de lo que hay (misma regla que la API).
                v_cant := LEAST(1 + FLOOR(RANDOM() * p.cant_max)::INTEGER, p.saldo);
                CONTINUE WHEN v_cant < 1;
                INSERT INTO detalle_venta (venta_id, producto_id, cantidad, precio_unitario, costo_unitario)
                VALUES (v_venta, p.producto_id, v_cant, p.precio, p.costo) RETURNING detalle_id INTO v_detalle;
                INSERT INTO movimiento_inventario (producto_id, usuario_id, detalle_id, tipo, cantidad, registrada_en)
                VALUES (p.producto_id, v_usuario, v_detalle, 'SALIDA_VENTA', v_cant, v_hora);
                v_total := v_total + v_cant * p.precio; v_lineas := v_lineas + 1;
            END LOOP;
            IF v_lineas = 0 THEN
                RAISE EXCEPTION 'Venta sin líneas el %: revise el plan de reposición', v_dia;
            END IF;

            -- Pago: más efectivo que medios electrónicos, como en una bodega real.
            v_metodo := CASE WHEN RANDOM() < 0.55 THEN 'EFECTIVO' WHEN RANDOM() < 0.6 THEN 'YAPE'
                             WHEN RANDOM() < 0.5 THEN 'PLIN' ELSE 'TARJETA' END;
            IF v_metodo = 'EFECTIVO' THEN
                -- El cliente paga con el billete o moneda inmediato superior.
                v_recibido := (SELECT MIN(b) FROM UNNEST(ARRAY[1, 2, 5, 10, 20, 50, 100, 200]::NUMERIC[]) b WHERE b >= v_total);
                v_recibido := COALESCE(v_recibido, CEIL(v_total / 10) * 10);
                INSERT INTO venta_pago (venta_id, metodo, total_cobrado, importe_recibido, verificado_por, registrado_en)
                VALUES (v_venta, 'EFECTIVO', v_total, v_recibido, v_usuario, v_hora);
            ELSE
                v_ref_n := v_ref_n + 1;
                INSERT INTO venta_pago (venta_id, metodo, modalidad_tarjeta, total_cobrado, referencia_externa,
                                        verificado_por, registrado_en)
                VALUES (v_venta, v_metodo,
                        CASE WHEN v_metodo = 'TARJETA' THEN (ARRAY['DEBITO', 'CREDITO'])[1 + FLOOR(RANDOM() * 2)::INTEGER] END,
                        v_total, 'DEMO-' || LEFT(v_metodo, 2) || '-' || LPAD(v_ref_n::TEXT, 6, '0'), v_usuario, v_hora);
            END IF;
        END LOOP;

        -- Mermas ocasionales al cierre (alrededor de una cada tres días).
        IF RANDOM() < 0.35 THEN
            SELECT pr.producto_id, pr.costo, s.cantidad AS saldo,
                   CASE pr.codigo WHEN 'P0004' THEN 'VENCIDO' WHEN 'P0003' THEN 'VENCIDO'
                                  WHEN 'P0008' THEN 'FALTANTE' ELSE 'DANADO' END AS motivo
              INTO p
              FROM producto pr JOIN inventario_saldo s USING (producto_id)
             WHERE pr.codigo IN ('P0001', 'P0002', 'P0003', 'P0004', 'P0008') AND s.cantidad >= 2
             ORDER BY RANDOM() LIMIT 1;
            IF FOUND THEN
                INSERT INTO movimiento_inventario (producto_id, usuario_id, tipo, cantidad, motivo_merma,
                                                   costo_unitario, registrada_en)
                VALUES (p.producto_id, v_propietario, 'MERMA', 1 + FLOOR(RANDOM() * 2)::INTEGER, p.motivo, p.costo,
                        (v_dia + TIME '21:45') AT TIME ZONE c_zona);
            END IF;
        END IF;
    END LOOP;
END $$;

COMMIT;
