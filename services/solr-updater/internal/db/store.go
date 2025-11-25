package db

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

type Config struct {
	Host     string
	Port     int
	User     string
	Password string
	Database string
}

type Store struct {
	db *sql.DB
}

type Book struct {
	ID          int64
	Title       string
	Author      string
	Genre       string
	Price       float64
	InStock     bool
	ISBN        string
	Description string
	UpdatedAt   time.Time
}

type Electronic struct {
	ID           int64
	Name         string
	Manufacturer string
	Price        float64
	InStock      bool
	Specs        string
	Description  string
	UpdatedAt    time.Time
}

func NewStore(cfg Config) (*Store, error) {
	dsn := fmt.Sprintf(
		"%s:%s@tcp(%s:%d)/%s?parseTime=true&charset=utf8mb4&loc=UTC",
		cfg.User,
		cfg.Password,
		cfg.Host,
		cfg.Port,
		cfg.Database,
	)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)
	db.SetConnMaxIdleTime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &Store{db: db}, nil
}

func (s *Store) Close() error {
	if s.db == nil {
		return nil
	}
	return s.db.Close()
}

// GetAndUpdateBook fetches a book by ID, updates its description with timestamp, and returns the updated record
func (s *Store) GetAndUpdateBook(ctx context.Context, id int64) (*Book, error) {
	timestamp := time.Now().UTC().Format(time.RFC3339)
	newDescription := fmt.Sprintf("Description added by solr-updater at %s", timestamp)

	// Update the description
	const updateQuery = `UPDATE books SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
	res, err := s.db.ExecContext(ctx, updateQuery, newDescription, id)
	if err != nil {
		return nil, fmt.Errorf("failed to update book: %w", err)
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rows == 0 {
		return nil, sql.ErrNoRows
	}

	// Fetch the updated record
	return s.GetBook(ctx, id)
}

// GetAndUpdateElectronic fetches an electronic by ID, updates its description with timestamp, and returns the updated record
func (s *Store) GetAndUpdateElectronic(ctx context.Context, id int64) (*Electronic, error) {
	timestamp := time.Now().UTC().Format(time.RFC3339)
	newDescription := fmt.Sprintf("Description added by solr-updater at %s", timestamp)

	// Update the description
	const updateQuery = `UPDATE electronics SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
	res, err := s.db.ExecContext(ctx, updateQuery, newDescription, id)
	if err != nil {
		return nil, fmt.Errorf("failed to update electronic: %w", err)
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rows == 0 {
		return nil, sql.ErrNoRows
	}

	// Fetch the updated record
	return s.GetElectronic(ctx, id)
}

func (s *Store) GetBook(ctx context.Context, id int64) (*Book, error) {
	const query = `
		SELECT id, title, author, genre, price, in_stock, isbn, COALESCE(description, ''), updated_at
		FROM books
		WHERE id = ?
	`

	var b Book
	var inStock uint8
	if err := s.db.QueryRowContext(ctx, query, id).Scan(
		&b.ID,
		&b.Title,
		&b.Author,
		&b.Genre,
		&b.Price,
		&inStock,
		&b.ISBN,
		&b.Description,
		&b.UpdatedAt,
	); err != nil {
		return nil, err
	}

	b.InStock = inStock == 1
	return &b, nil
}

func (s *Store) GetElectronic(ctx context.Context, id int64) (*Electronic, error) {
	const query = `
		SELECT id, name, manufacturer, price, in_stock, 
		       COALESCE(specs, '{}'), COALESCE(description, ''), updated_at
		FROM electronics
		WHERE id = ?
	`

	var e Electronic
	var inStock uint8
	if err := s.db.QueryRowContext(ctx, query, id).Scan(
		&e.ID,
		&e.Name,
		&e.Manufacturer,
		&e.Price,
		&inStock,
		&e.Specs,
		&e.Description,
		&e.UpdatedAt,
	); err != nil {
		return nil, err
	}

	e.InStock = inStock == 1
	return &e, nil
}

