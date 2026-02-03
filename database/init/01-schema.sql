-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Materials table
CREATE TABLE materials (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL, -- PLA, ABS, PETG, Resin, etc.
    cost_per_gram DECIMAL(10, 4) NOT NULL,
    density DECIMAL(10, 4) NOT NULL, -- g/cm³
    color VARCHAR(50),
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Print configurations
CREATE TABLE print_configs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    layer_height DECIMAL(5, 3) NOT NULL, -- mm
    infill_percentage INTEGER NOT NULL CHECK (infill_percentage >= 0 AND infill_percentage <= 100),
    support_enabled BOOLEAN DEFAULT false,
    print_speed INTEGER, -- mm/s
    time_multiplier DECIMAL(5, 2) DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Quotes table (STL uploads and pricing)
CREATE TABLE quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255), -- For non-authenticated users
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    stl_filename VARCHAR(255) NOT NULL,
    s3_key VARCHAR(500) NOT NULL,
    
    -- STL analysis results
    volume_cm3 DECIMAL(12, 4) NOT NULL,
    surface_area_cm2 DECIMAL(12, 4),
    bounding_box_x DECIMAL(10, 2),
    bounding_box_y DECIMAL(10, 2),
    bounding_box_z DECIMAL(10, 2),
    
    -- Print settings
    material_id INTEGER REFERENCES materials(id),
    print_config_id INTEGER REFERENCES print_configs(id),
    
    -- Pricing breakdown
    material_cost DECIMAL(10, 2),
    machine_cost DECIMAL(10, 2),
    labor_cost DECIMAL(10, 2),
    total_price DECIMAL(10, 2) NOT NULL,
    estimated_print_time_minutes INTEGER,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending', -- pending, accepted, expired, ordered
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders table
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    quote_id UUID REFERENCES quotes(id),
    
    -- Order details
    order_number VARCHAR(50) UNIQUE NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, processing, printing, completed, shipped, cancelled
    
    -- Shipping info
    shipping_name VARCHAR(200),
    shipping_address TEXT,
    shipping_city VARCHAR(100),
    shipping_postal_code VARCHAR(20),
    shipping_country VARCHAR(100),
    
    -- Payment
    payment_status VARCHAR(50) DEFAULT 'pending',
    payment_method VARCHAR(50),
    payment_id VARCHAR(255), -- Stripe payment intent ID
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Pre-printed products table
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    price DECIMAL(10, 2) NOT NULL,
    
    -- Product details
    material_id INTEGER REFERENCES materials(id),
    weight_grams INTEGER,
    dimensions_x DECIMAL(10, 2),
    dimensions_y DECIMAL(10, 2),
    dimensions_z DECIMAL(10, 2),
    
    -- Inventory
    stock_quantity INTEGER DEFAULT 0,
    is_available BOOLEAN DEFAULT true,
    
    -- Images
    primary_image_url TEXT,
    images JSONB, -- Array of image URLs
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order items (for pre-printed products)
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_quotes_user_id ON quotes(user_id);
CREATE INDEX idx_quotes_session_id ON quotes(session_id);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_is_available ON products(is_available);
