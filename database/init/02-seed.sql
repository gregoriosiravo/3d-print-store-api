-- Insert default materials
INSERT INTO materials (name, type, cost_per_gram, density, color, is_available) VALUES
('PLA White', 'PLA', 0.025, 1.24, 'White', true),
('PLA Black', 'PLA', 0.025, 1.24, 'Black', true),
('PLA Red', 'PLA', 0.025, 1.24, 'Red', true),
('ABS Black', 'ABS', 0.030, 1.04, 'Black', true),
('PETG Clear', 'PETG', 0.035, 1.27, 'Clear', true),
('TPU Flexible', 'TPU', 0.045, 1.21, 'Black', true);

-- Insert default print configurations
INSERT INTO print_configs (name, layer_height, infill_percentage, support_enabled, print_speed, time_multiplier) VALUES
('Draft - Fast', 0.300, 15, false, 80, 0.8),
('Standard Quality', 0.200, 20, false, 60, 1.0),
('High Quality', 0.100, 25, false, 40, 1.5),
('Extra Strong', 0.200, 50, true, 50, 1.3);
