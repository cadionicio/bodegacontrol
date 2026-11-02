-- BodegaControl V6 | Grupo 2 · UNI | PostgreSQL 16+
-- Esquema consolidado (v3 + v5 + v6 + costo, stock mínimo, mermas e imágenes). Sustituye la cadena de
-- migraciones porque aún no existe una base productiva que migrar.
-- Las reglas de negocio (permisos, precios, idempotencia) viven en la capa de servicios de la API;
-- aquí solo se garantizan invariantes que ningún cliente, ni un backend con errores, debe romper.
-- Detalle de cada atributo: ver DICCIONARIO_DE_DATOS.md.
BEGIN;
CREATE SCHEMA IF NOT EXISTS bc;
SET LOCAL search_path = bc;

-- ───────────────────────── Seguridad ─────────────────────────
CREATE TABLE rol (
    rol_id      SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo      VARCHAR(20) NOT NULL UNIQUE CHECK (codigo IN ('PROPIETARIO', 'CAJERO')),
    descripcion VARCHAR(90) NOT NULL
);

CREATE TABLE usuario (
    usuario_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rol_id          SMALLINT NOT NULL REFERENCES rol ON DELETE RESTRICT,
    nombre          VARCHAR(100) NOT NULL CHECK (LENGTH(BTRIM(nombre)) > 0),
    correo          VARCHAR(160) NOT NULL UNIQUE
                    CHECK (correo = LOWER(BTRIM(correo)) AND POSITION('@' IN correo) > 1),
    contrasena_hash TEXT NOT NULL CHECK (contrasena_hash LIKE '$2%'),  -- solo hashes bcrypt
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ───────────────────────── Catálogo e inventario ─────────────────────────
-- Código interno correlativo (P0001, P0002…) asignado por la BD: nadie tiene que inventarlo y una
-- secuencia no repite valores aunque dos altas ocurran a la vez. Pasa de 4 dígitos sin truncarse (P10000).
CREATE SEQUENCE producto_codigo_seq;
CREATE FUNCTION siguiente_codigo_producto() RETURNS TEXT LANGUAGE sql AS $$
    SELECT 'P' || LPAD(n::TEXT, GREATEST(4, LENGTH(n::TEXT)), '0') FROM NEXTVAL('bc.producto_codigo_seq') AS n
$$;

CREATE TABLE producto (
    producto_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo         VARCHAR(32) NOT NULL UNIQUE DEFAULT siguiente_codigo_producto()
                   CHECK (codigo ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'),
    -- Etiqueta EAN/UPC o QR reconocido: distinta del código interno y opcional.
    codigo_barras  VARCHAR(64) UNIQUE CHECK (codigo_barras ~ '^[A-Za-z0-9._-]{4,64}$'),
    nombre         VARCHAR(120) NOT NULL CHECK (LENGTH(BTRIM(nombre)) > 0),
    precio         NUMERIC(12,2) NOT NULL CHECK (precio > 0),
    -- NULL = costo desconocido: la ganancia se reporta "sin dato" en vez de inflarse con costo 0.
    costo          NUMERIC(12,2) CHECK (costo >= 0),
    -- Umbral de alerta "por reponer": política del producto, no estado del inventario.
    stock_minimo   INTEGER NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
    activo         BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Proyección del libro de movimientos: solo la modifican los triggers de este esquema.
CREATE TABLE inventario_saldo (
    producto_id    BIGINT PRIMARY KEY REFERENCES producto ON DELETE RESTRICT,
    cantidad       INTEGER NOT NULL DEFAULT 0 CONSTRAINT ck_saldo_no_negativo CHECK (cantidad >= 0),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Foto del producto en tabla aparte: el catálogo se consulta sin arrastrar binarios.
-- No es historia de negocio: puede reemplazarse o eliminarse.
CREATE TABLE producto_imagen (
    producto_id    BIGINT PRIMARY KEY REFERENCES producto ON DELETE RESTRICT,
    tipo_mime      VARCHAR(10) NOT NULL CHECK (tipo_mime IN ('image/jpeg', 'image/png', 'image/webp')),
    -- Límite de 500 KB: la app comprime la foto antes de subirla; evita inflar la base gratuita.
    contenido      BYTEA NOT NULL CHECK (OCTET_LENGTH(contenido) BETWEEN 100 AND 512000),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cliente general = venta.cliente_id NULL; no se crean clientes ficticios por venta.
CREATE TABLE cliente (
    cliente_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo_documento   VARCHAR(8) NOT NULL DEFAULT 'NINGUNO',
    numero_documento VARCHAR(24),
    nombre           VARCHAR(140) NOT NULL CHECK (LENGTH(BTRIM(nombre)) > 0),
    telefono         VARCHAR(15) CHECK (telefono ~ '^\+?[0-9]{6,14}$'),
    activo           BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- COALESCE: un CHECK que evalúa NULL se aprueba en SQL; se fuerza un resultado booleano.
    CONSTRAINT ck_cliente_documento CHECK (COALESCE(
           (tipo_documento = 'NINGUNO' AND numero_documento IS NULL)
        OR (tipo_documento = 'DNI' AND numero_documento ~ '^[0-9]{8}$')
        OR (tipo_documento = 'RUC' AND numero_documento ~ '^(10|15|17|20)[0-9]{9}$')
        OR (tipo_documento = 'CE'  AND numero_documento ~ '^[A-Za-z0-9]{4,24}$'), FALSE)),
    CONSTRAINT uq_cliente_documento UNIQUE (tipo_documento, numero_documento)
);

-- ───────────────────────── Ventas ─────────────────────────
CREATE TABLE venta (
    venta_id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id         BIGINT NOT NULL REFERENCES usuario ON DELETE RESTRICT,
    cliente_id         BIGINT REFERENCES cliente ON DELETE RESTRICT,
    -- Idempotencia: misma clave + misma firma devuelve la venta original (RN-07).
    clave_idempotencia UUID NOT NULL UNIQUE,
    solicitud_firma    CHAR(64) NOT NULL CHECK (solicitud_firma ~ '^[0-9a-f]{64}$'),  -- SHA-256
    registrada_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Precio y costo se congelan al vender: los reportes no se recalculan con valores actuales (RN-04).
CREATE TABLE detalle_venta (
    detalle_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    venta_id        BIGINT NOT NULL REFERENCES venta ON DELETE RESTRICT,
    producto_id     BIGINT NOT NULL REFERENCES producto ON DELETE RESTRICT,
    cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(12,2) NOT NULL CHECK (precio_unitario > 0),
    costo_unitario  NUMERIC(12,2) CHECK (costo_unitario >= 0),
    CONSTRAINT uq_detalle_venta_producto UNIQUE (venta_id, producto_id),  -- RN-02
    CONSTRAINT uq_detalle_id_producto UNIQUE (detalle_id, producto_id)    -- destino de FK compuesta
);

-- Un pago por venta en V6; las ventas mixtas (P2) solo exigirían retirar uq_pago_venta.
-- Nunca se almacenan PAN, CVV ni credenciales bancarias (RN-06).
CREATE TABLE venta_pago (
    pago_id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    venta_id           BIGINT NOT NULL REFERENCES venta ON DELETE RESTRICT,
    metodo             VARCHAR(8) NOT NULL CHECK (metodo IN ('EFECTIVO', 'YAPE', 'PLIN', 'TARJETA')),
    modalidad_tarjeta  VARCHAR(7),
    monto              NUMERIC(14,2) NOT NULL CHECK (monto > 0),  -- = total; el vuelto no es ingreso
    importe_recibido   NUMERIC(14,2),
    referencia_externa VARCHAR(80),
    verificado_por     BIGINT NOT NULL REFERENCES usuario ON DELETE RESTRICT,
    registrado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_pago_venta UNIQUE (venta_id),
    CONSTRAINT ck_pago_modalidad CHECK (COALESCE(
        (metodo = 'TARJETA' AND modalidad_tarjeta IN ('DEBITO', 'CREDITO'))
        OR (metodo <> 'TARJETA' AND modalidad_tarjeta IS NULL), FALSE)),
    -- Efectivo exige importe recibido ≥ monto (RN-05); medios electrónicos exigen referencia verificada.
    CONSTRAINT ck_pago_evidencia CHECK (COALESCE(
        (metodo = 'EFECTIVO' AND importe_recibido >= monto AND referencia_externa IS NULL)
        OR (metodo <> 'EFECTIVO' AND importe_recibido IS NULL
            AND LENGTH(BTRIM(referencia_externa)) BETWEEN 4 AND 80), FALSE))
);
CREATE UNIQUE INDEX uq_pago_referencia ON venta_pago (metodo, referencia_externa)
    WHERE referencia_externa IS NOT NULL;  -- una operación Yape/Plin/POS no paga dos ventas

-- Libro mayor append-only: única vía para cambiar el stock.
CREATE TABLE movimiento_inventario (
    movimiento_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    producto_id    BIGINT NOT NULL REFERENCES producto ON DELETE RESTRICT,
    usuario_id     BIGINT NOT NULL REFERENCES usuario ON DELETE RESTRICT,
    detalle_id     BIGINT UNIQUE,
    tipo           VARCHAR(12) NOT NULL CHECK (tipo IN ('ALTA', 'ENTRADA', 'SALIDA_VENTA', 'MERMA')),
    cantidad       INTEGER NOT NULL CHECK (cantidad > 0),
    motivo_merma   VARCHAR(8) CHECK (motivo_merma IN ('VENCIDO', 'DANADO', 'FALTANTE', 'OTRO')),
    -- Costo congelado de la merma: mide la pérdida en soles aunque el costo cambie después.
    costo_unitario NUMERIC(12,2) CHECK (costo_unitario >= 0),
    referencia     VARCHAR(120),  -- documento de reposición u observación de la merma
    registrada_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- La FK compuesta impide asociar una salida a un detalle de otro producto.
    CONSTRAINT fk_movimiento_detalle FOREIGN KEY (detalle_id, producto_id)
        REFERENCES detalle_venta (detalle_id, producto_id) ON DELETE RESTRICT,
    CONSTRAINT ck_movimiento_origen CHECK (COALESCE(
           (tipo = 'SALIDA_VENTA' AND detalle_id IS NOT NULL AND referencia IS NULL AND motivo_merma IS NULL)
        OR (tipo = 'ALTA'    AND detalle_id IS NULL AND referencia IS NULL AND motivo_merma IS NULL)
        OR (tipo = 'ENTRADA' AND detalle_id IS NULL AND LENGTH(BTRIM(referencia)) > 0 AND motivo_merma IS NULL)
        -- Merma básica: motivo obligatorio; la observación solo es obligatoria si el motivo es OTRO.
        OR (tipo = 'MERMA'   AND detalle_id IS NULL AND motivo_merma IS NOT NULL
            AND (motivo_merma <> 'OTRO' OR LENGTH(BTRIM(referencia)) > 0)), FALSE)),
    CONSTRAINT ck_movimiento_costo CHECK (tipo = 'MERMA' OR costo_unitario IS NULL)
);
CREATE UNIQUE INDEX uq_movimiento_alta ON movimiento_inventario (producto_id) WHERE tipo = 'ALTA';

-- ───────────────────────── Auditoría de reportes ─────────────────────────
-- Solo metadatos de exportaciones exitosas; los archivos no se guardan en la BD.
CREATE TABLE reporte_exportacion (
    exportacion_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id      BIGINT NOT NULL REFERENCES usuario ON DELETE RESTRICT,
    tipo_reporte    VARCHAR(10) NOT NULL DEFAULT 'VENTAS'
                    CHECK (tipo_reporte IN ('VENTAS', 'PRODUCTOS', 'MERMAS')),
    formato         VARCHAR(3) NOT NULL CHECK (formato IN ('PDF', 'CSV')),
    periodo         VARCHAR(13) NOT NULL CHECK (periodo IN ('DIARIO', 'SEMANAL', 'MENSUAL', 'BIMESTRAL',
                        'TRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'TODO', 'PERSONALIZADO')),
    desde           TIMESTAMPTZ NOT NULL,
    hasta_exclusivo TIMESTAMPTZ NOT NULL,  -- intervalo semiabierto [desde, hasta) (RN-08)
    cantidad_filas  INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_filas >= 0),
    generado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_exportacion_intervalo CHECK (desde < hasta_exclusivo)
);

-- ───────────────────────── Índices de consulta ─────────────────────────
CREATE INDEX ix_venta_fecha          ON venta (registrada_en DESC, venta_id DESC);
CREATE INDEX ix_venta_usuario_fecha  ON venta (usuario_id, registrada_en DESC);
CREATE INDEX ix_venta_cliente_fecha  ON venta (cliente_id, registrada_en DESC) WHERE cliente_id IS NOT NULL;
CREATE INDEX ix_detalle_producto     ON detalle_venta (producto_id);
CREATE INDEX ix_movimiento_producto  ON movimiento_inventario (producto_id, registrada_en DESC, movimiento_id DESC);
CREATE INDEX ix_movimiento_merma     ON movimiento_inventario (registrada_en DESC) WHERE tipo = 'MERMA';
CREATE INDEX ix_exportacion_usuario  ON reporte_exportacion (usuario_id, generado_en DESC);
CREATE INDEX ix_producto_nombre      ON producto (LOWER(nombre));

-- ───────────────────────── Funciones y triggers ─────────────────────────
-- Fuente única del signo de cada tipo de movimiento (triggers y vistas la comparten).
CREATE FUNCTION variacion_stock(p_tipo TEXT, p_cantidad INTEGER) RETURNS INTEGER
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN p_tipo IN ('SALIDA_VENTA', 'MERMA') THEN -p_cantidad ELSE p_cantidad END
$$;

-- Las operaciones confirmadas no se editan: se corrigen con operaciones compensatorias futuras.
CREATE FUNCTION rechazar_cambio_historico() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Registro histórico inmutable (%)', TG_TABLE_NAME USING ERRCODE = '23514';
END $$;

CREATE TRIGGER tr_venta_inmutable      BEFORE UPDATE OR DELETE ON venta
    FOR EACH ROW EXECUTE FUNCTION rechazar_cambio_historico();
CREATE TRIGGER tr_detalle_inmutable    BEFORE UPDATE OR DELETE ON detalle_venta
    FOR EACH ROW EXECUTE FUNCTION rechazar_cambio_historico();
CREATE TRIGGER tr_pago_inmutable       BEFORE UPDATE OR DELETE ON venta_pago
    FOR EACH ROW EXECUTE FUNCTION rechazar_cambio_historico();
CREATE TRIGGER tr_movimiento_inmutable BEFORE UPDATE OR DELETE ON movimiento_inventario
    FOR EACH ROW EXECUTE FUNCTION rechazar_cambio_historico();

-- Todo producto nace con saldo 0; el stock inicial llega después como movimiento ALTA.
CREATE FUNCTION crear_saldo_inicial() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO bc.inventario_saldo (producto_id) VALUES (NEW.producto_id);
    RETURN NULL;
END $$;
CREATE TRIGGER tr_producto_saldo AFTER INSERT ON producto
    FOR EACH ROW EXECUTE FUNCTION crear_saldo_inicial();

CREATE FUNCTION marcar_actualizacion() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.actualizado_en := NOW();
    RETURN NEW;
END $$;
CREATE TRIGGER tr_producto_actualizado BEFORE UPDATE ON producto
    FOR EACH ROW EXECUTE FUNCTION marcar_actualizacion();

-- Defensa en profundidad: la salida de inventario debe coincidir con la cantidad vendida.
CREATE FUNCTION validar_cantidad_salida() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.tipo = 'SALIDA_VENTA' AND NEW.cantidad IS DISTINCT FROM
       (SELECT cantidad FROM bc.detalle_venta WHERE detalle_id = NEW.detalle_id) THEN
        RAISE EXCEPTION 'La salida no coincide con el detalle de venta' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tr_verificar_salida BEFORE INSERT ON movimiento_inventario
    FOR EACH ROW EXECUTE FUNCTION validar_cantidad_salida();

-- Cada movimiento ajusta el saldo en la misma transacción: el descuadre se vuelve imposible.
-- Si el resultado fuera negativo, ck_saldo_no_negativo aborta la operación completa.
CREATE FUNCTION aplicar_movimiento() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE bc.inventario_saldo
       SET cantidad = cantidad + bc.variacion_stock(NEW.tipo, NEW.cantidad), actualizado_en = NOW()
     WHERE producto_id = NEW.producto_id;
    RETURN NULL;
END $$;
CREATE TRIGGER tr_aplicar_movimiento AFTER INSERT ON movimiento_inventario
    FOR EACH ROW EXECUTE FUNCTION aplicar_movimiento();

-- El saldo solo cambia desde otro trigger (profundidad ≥ 2); un UPDATE directo se rechaza.
CREATE FUNCTION proteger_saldo() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF PG_TRIGGER_DEPTH() < 2 THEN
        RAISE EXCEPTION 'El saldo solo cambia registrando movimientos de inventario' USING ERRCODE = '23514';
    END IF;
    RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER tr_proteger_saldo BEFORE INSERT OR UPDATE OR DELETE ON inventario_saldo
    FOR EACH ROW EXECUTE FUNCTION proteger_saldo();

-- Verificación al COMMIT: venta con ≥1 línea, exactamente un pago igual al total y una
-- salida de inventario por línea. Se difiere porque cabecera, detalle y pago se insertan por separado.
CREATE FUNCTION validar_venta_completa() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_lineas INTEGER; v_total NUMERIC; v_salidas INTEGER; v_pagos INTEGER; v_monto NUMERIC;
BEGIN
    SELECT COUNT(*), SUM(d.cantidad * d.precio_unitario), COUNT(m.movimiento_id)
      INTO v_lineas, v_total, v_salidas
      FROM bc.detalle_venta d LEFT JOIN bc.movimiento_inventario m ON m.detalle_id = d.detalle_id
     WHERE d.venta_id = NEW.venta_id;
    SELECT COUNT(*), MAX(monto) INTO v_pagos, v_monto FROM bc.venta_pago WHERE venta_id = NEW.venta_id;
    IF v_lineas = 0 OR v_salidas <> v_lineas OR v_pagos <> 1 OR v_monto <> v_total THEN
        RAISE EXCEPTION 'Venta % incompleta o descuadrada', NEW.venta_id USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER ct_venta_completa   AFTER INSERT ON venta
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validar_venta_completa();
CREATE CONSTRAINT TRIGGER ct_detalle_completo AFTER INSERT ON detalle_venta
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validar_venta_completa();
CREATE CONSTRAINT TRIGGER ct_pago_completo    AFTER INSERT ON venta_pago
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validar_venta_completa();

-- ───────────────────────── Vistas de lectura ─────────────────────────
-- Totales derivados en vistas, no en columnas: evita inconsistencias entre cabecera y detalle.
-- Costo y ganancia quedan NULL si alguna línea no tiene costo: un dato parcial engañaría.
CREATE VIEW v_venta_resumen AS
SELECT v.venta_id, v.registrada_en, v.usuario_id, u.nombre AS cajero, v.cliente_id,
       c.nombre AS cliente, v.clave_idempotencia,
       COUNT(*)::INTEGER                                   AS lineas,
       SUM(d.cantidad)::INTEGER                            AS unidades,
       SUM(d.cantidad * d.precio_unitario)::NUMERIC(14,2)  AS total,
       CASE WHEN BOOL_AND(d.costo_unitario IS NOT NULL)
            THEN SUM(d.cantidad * d.costo_unitario)::NUMERIC(14,2) END                       AS costo_total,
       CASE WHEN BOOL_AND(d.costo_unitario IS NOT NULL)
            THEN SUM(d.cantidad * (d.precio_unitario - d.costo_unitario))::NUMERIC(14,2) END AS ganancia,
       p.metodo, p.modalidad_tarjeta, p.importe_recibido, p.referencia_externa,
       (p.importe_recibido - p.monto)::NUMERIC(14,2)       AS vuelto
FROM venta v
JOIN usuario u       ON u.usuario_id = v.usuario_id
JOIN detalle_venta d ON d.venta_id = v.venta_id
JOIN venta_pago p    ON p.venta_id = v.venta_id
LEFT JOIN cliente c  ON c.cliente_id = v.cliente_id
GROUP BY v.venta_id, u.nombre, c.nombre, p.pago_id;

-- Granularidad producto-venta para rankings, demanda y CSV analítico.
CREATE VIEW v_venta_detalle AS
SELECT v.venta_id, v.registrada_en, v.usuario_id, v.cliente_id,
       pr.producto_id, pr.codigo, pr.nombre AS producto_actual,
       d.cantidad, d.precio_unitario, d.costo_unitario,
       (d.cantidad * d.precio_unitario)::NUMERIC(14,2)                      AS importe,
       (d.cantidad * (d.precio_unitario - d.costo_unitario))::NUMERIC(14,2) AS ganancia
FROM venta v
JOIN detalle_venta d ON d.venta_id = v.venta_id
JOIN producto pr     ON pr.producto_id = d.producto_id;

-- imagen_version cambia al reemplazar la foto: la app la usa para invalidar su caché.
CREATE VIEW v_producto_stock AS
SELECT p.producto_id, p.codigo, p.codigo_barras, p.nombre, p.precio, p.costo,
       p.stock_minimo, p.activo, s.cantidad AS stock, s.actualizado_en AS stock_actualizado_en,
       (s.cantidad <= p.stock_minimo) AS por_reponer, p.actualizado_en,
       EXTRACT(EPOCH FROM i.actualizado_en)::BIGINT AS imagen_version
FROM producto p
JOIN inventario_saldo s       ON s.producto_id = p.producto_id
LEFT JOIN producto_imagen i   ON i.producto_id = p.producto_id;

-- Base del reporte de mermas: pérdida valorizada al costo vigente en el momento de la baja.
CREATE VIEW v_merma AS
SELECT m.movimiento_id, m.registrada_en, m.producto_id, p.codigo, p.nombre, m.motivo_merma,
       m.cantidad, m.costo_unitario, (m.cantidad * m.costo_unitario)::NUMERIC(14,2) AS valor_perdido,
       m.referencia AS observacion, u.nombre AS registrado_por
FROM movimiento_inventario m
JOIN producto p ON p.producto_id = m.producto_id
JOIN usuario u  ON u.usuario_id = m.usuario_id
WHERE m.tipo = 'MERMA';

CREATE VIEW v_trazabilidad_producto AS
SELECT m.movimiento_id, m.producto_id, p.codigo, p.nombre, m.registrada_en, m.tipo, m.motivo_merma,
       m.cantidad, variacion_stock(m.tipo, m.cantidad) AS variacion,
       SUM(variacion_stock(m.tipo, m.cantidad))
           OVER (PARTITION BY m.producto_id ORDER BY m.registrada_en, m.movimiento_id) AS saldo_reconstruido,
       u.nombre AS operador, d.venta_id, m.referencia
FROM movimiento_inventario m
JOIN producto p           ON p.producto_id = m.producto_id
JOIN usuario u            ON u.usuario_id = m.usuario_id
LEFT JOIN detalle_venta d ON d.detalle_id = m.detalle_id;

-- Prueba de conciliación RNF-01/RNF-08: debe devolver cero filas.
CREATE VIEW v_descuadre_inventario AS
SELECT s.producto_id, s.cantidad AS saldo,
       COALESCE(SUM(variacion_stock(m.tipo, m.cantidad)), 0) AS saldo_libro
FROM inventario_saldo s
LEFT JOIN movimiento_inventario m ON m.producto_id = s.producto_id
GROUP BY s.producto_id, s.cantidad
HAVING s.cantidad <> COALESCE(SUM(variacion_stock(m.tipo, m.cantidad)), 0);

INSERT INTO rol (codigo, descripcion) VALUES
    ('PROPIETARIO', 'Gestiona catálogo, inventario, mermas, reportes y registra ventas'),
    ('CAJERO',      'Consulta catálogo, registra clientes y ventas');
COMMIT;
