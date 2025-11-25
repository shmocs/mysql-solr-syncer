-- Create database
DROP DATABASE IF EXISTS solr_sync;
CREATE DATABASE solr_sync CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE solr_sync;

-- Books table
CREATE TABLE books (
  id INT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  author VARCHAR(255) NOT NULL,
  genre VARCHAR(128) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  in_stock TINYINT(1) NOT NULL DEFAULT 1,
  isbn VARCHAR(32) NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_genre (genre),
  INDEX idx_author (author)
) ENGINE=InnoDB;

-- Electronics table
CREATE TABLE electronics (
  id INT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  manufacturer VARCHAR(255) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  in_stock TINYINT(1) NOT NULL DEFAULT 1,
  specs JSON,
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_manufacturer (manufacturer)
) ENGINE=InnoDB;

-- Seed procedure for books
DELIMITER $$
CREATE PROCEDURE seed_books()
BEGIN
  DECLARE i INT DEFAULT 1;
  WHILE i <= 10000 DO
    INSERT INTO books (id, title, author, genre, price, in_stock, isbn, description)
    VALUES (
      i,
      CONCAT('Book Title ', LPAD(i, 5, '0')),
      CONCAT('Author ', MOD(i, 250) + 1),
      ELT(MOD(i, 5) + 1, 'fiction', 'non-fiction', 'biography', 'fantasy', 'sci-fi'),
      ROUND(5 + (MOD(i, 200)) * 0.45, 2),
      IF(MOD(i, 7) = 0, 0, 1),
      CONCAT('ISBN', LPAD(i, 10, '0')),
      CONCAT('Initial description for book #', i, ' - seeded at bootstrap')
    );
    SET i = i + 1;
  END WHILE;
END $$

-- Seed procedure for electronics
CREATE PROCEDURE seed_electronics()
BEGIN
  DECLARE i INT DEFAULT 1;
  WHILE i <= 10000 DO
    INSERT INTO electronics (id, name, manufacturer, price, in_stock, specs, description)
    VALUES (
      i,
      CONCAT('Electronic Gadget ', LPAD(i, 5, '0')),
      CONCAT('Manufacturer ', MOD(i, 150) + 1),
      ROUND(15 + (MOD(i, 400)) * 0.85, 2),
      IF(MOD(i, 9) = 0, 0, 1),
      JSON_OBJECT(
        'color', ELT(MOD(i, 4) + 1, 'black', 'white', 'silver', 'blue'),
        'warranty_months', MOD(i, 36) + 12,
        'power_rating', CONCAT(MOD(i, 200) + 50, 'W'),
        'weight_kg', ROUND(0.5 + (MOD(i, 100) * 0.05), 2)
      ),
      CONCAT('Initial description for electronics #', i, ' - seeded at bootstrap')
    );
    SET i = i + 1;
  END WHILE;
END $$
DELIMITER ;

-- Execute seed procedures
CALL seed_books();
CALL seed_electronics();

-- Clean up
DROP PROCEDURE seed_books;
DROP PROCEDURE seed_electronics;

-- Display summary
SELECT 'Books seeded' AS status, COUNT(*) AS count FROM books;
SELECT 'Electronics seeded' AS status, COUNT(*) AS count FROM electronics;


