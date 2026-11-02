-- BodegaControl V6 | Datos iniciales reproducibles.
-- Credenciales de demostración (documentadas en README):
--   PROPIETARIO cadionicio@gmail.com / Propietario2026
--   CAJERO      giancarlo@uni.pe     / Cajero2026
-- Los hashes son bcrypt reales (costo 12); nunca se almacena una contraseña en texto claro.
BEGIN;
SET LOCAL search_path = bc;

INSERT INTO usuario (rol_id, nombre, correo, contrasena_hash)
SELECT r.rol_id, u.nombre, u.correo, u.hash
FROM (VALUES
    ('PROPIETARIO', 'Cesar Dionicio',   'cadionicio@gmail.com', '$2b$12$ILayIj0ExlAmy4WLKxlaLeA7omYZtXgQusVDonCLckMmzsuiNeDmq'),
    ('CAJERO',      'Giancarlo Aguirre', 'giancarlo@uni.pe',     '$2b$12$Q2aZ/r8RdhJQvo4gwR.51e67hfAHfmwY6nGaQvSgpssp0ItYXuGTm')
) AS u(rol, nombre, correo, hash)
JOIN rol r ON r.codigo = u.rol;

-- El trigger tr_producto_saldo crea cada saldo en 0 y tr_aplicar_movimiento suma el ALTA:
-- el stock inicial queda trazado desde el primer día.
-- 'Pan francés' no tiene costo registrado a propósito: demuestra la ganancia "sin dato".
WITH datos (codigo, nombre, precio, costo, stock, minimo) AS (VALUES
    ('P0001', 'Coca-Cola 500 ml', 3.50, 2.60, 24, 10),
    ('P0002', 'Inca Kola 500 ml', 3.50, 2.60, 36, 10),
    ('P0003', 'Galletas Soda Field 6 und.', 4.20, 3.10, 8, 5),
    ('P0004', 'Leche Gloria azul 400 g', 4.80, 3.90, 52, 12),
    ('P0005', 'Arroz Costeño 1 kg', 5.20, 4.30, 30, 8),
    ('P0006', 'Azúcar rubia 1 kg', 4.50, 3.70, 4, 6),
    ('P0007', 'Aceite Primor 1 L', 11.90, 9.80, 12, 4),
    ('P0008', 'Pan francés (unidad)', 0.30, NULL, 60, 20)
), nuevos AS (
    INSERT INTO producto (codigo, nombre, precio, costo, stock_minimo)
    SELECT codigo, nombre, precio, costo::NUMERIC, minimo FROM datos
    RETURNING producto_id, codigo
)
INSERT INTO movimiento_inventario (producto_id, usuario_id, tipo, cantidad)
SELECT n.producto_id, (SELECT usuario_id FROM usuario WHERE correo = 'cadionicio@gmail.com'), 'ALTA', d.stock
FROM nuevos n JOIN datos d USING (codigo)
WHERE d.stock > 0;
COMMIT;
