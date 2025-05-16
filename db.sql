-- Database Schema for Jiajiri Hub

-- Create database
CREATE DATABASE IF NOT EXISTS jiajiri_hub;
USE jiajiri_hub;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('worker', 'client', 'admin') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_verified BOOLEAN DEFAULT FALSE
);

-- Worker profiles table
CREATE TABLE IF NOT EXISTS worker_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  bio TEXT,
  location VARCHAR(100) NOT NULL,
  service_category VARCHAR(100) NOT NULL,
  price_range VARCHAR(50) NOT NULL,
  image_url VARCHAR(255),
  id_number VARCHAR(50),
  is_verified BOOLEAN DEFAULT FALSE,
  availability TEXT,
  average_rating DECIMAL(3,2) DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Services table
CREATE TABLE IF NOT EXISTS services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  worker_id INT NOT NULL,
  service_title VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  image_url VARCHAR(255),
  FOREIGN KEY (worker_id) REFERENCES worker_profiles(id) ON DELETE CASCADE
);

-- Job requests table
CREATE TABLE IF NOT EXISTS job_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  worker_id INT NOT NULL,
  description TEXT NOT NULL,
  status ENUM('pending', 'accepted', 'rejected', 'completed') DEFAULT 'pending',
  scheduled_time DATETIME NOT NULL,
  location VARCHAR(255) NOT NULL,
  image_url VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id) REFERENCES worker_profiles(id) ON DELETE CASCADE
);

-- Reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  client_id INT NOT NULL,
  worker_id INT NOT NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES job_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id) REFERENCES worker_profiles(id) ON DELETE CASCADE
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sender_id INT NOT NULL,
  receiver_id INT NOT NULL,
  message_body TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Service categories table
CREATE TABLE IF NOT EXISTS service_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  icon VARCHAR(50)
);

-- Contact messages table
CREATE TABLE IF NOT EXISTS contact_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  subject VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_read BOOLEAN DEFAULT FALSE
);


-- Insert default service categories
INSERT INTO service_categories (name, description, icon) VALUES
('Plumbing', 'Plumbing services including repairs, installations, and maintenance', 'fa-wrench'),
('Electrical', 'Electrical services including wiring, installations, and repairs', 'fa-bolt'),
('Cleaning', 'Home and office cleaning services', 'fa-broom'),
('Carpentry', 'Woodworking, furniture repair, and installations', 'fa-hammer'),
('Painting', 'Interior and exterior painting services', 'fa-paint-roller'),
('Gardening', 'Landscaping and garden maintenance services', 'fa-leaf'),
('Tailoring', 'Clothing alterations and custom tailoring', 'fa-scissors'),
('Beauty', 'Hair styling, makeup, and beauty services', 'fa-cut'),
('Tutoring', 'Educational tutoring and coaching', 'fa-book'),
('Driving', 'Transportation and driving services', 'fa-car'),
('Cooking', 'Catering and cooking services', 'fa-utensils'),
('IT Support', 'Computer and technology support services', 'fa-laptop');

-- Insert admin user
INSERT INTO users (name, email, phone, password_hash, role, is_verified)
VALUES ('Admin', 'admin2@jiajirihub.com', '+254724057947', '$2b$10$X/XQvjlGQKrE.YhkP3K9XOExWDxWQlIBXCKiYBW9yPgZVVUgQUFXS', 'admin', TRUE);
-- Password is 'admin123' (hashed with bcrypt)
