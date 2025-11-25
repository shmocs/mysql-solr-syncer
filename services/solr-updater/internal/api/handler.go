package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/termene/solr-sync/solr-updater/internal/db"
	"github.com/termene/solr-sync/solr-updater/internal/solr"
)

type Handler struct {
	store  *db.Store
	solr   *solr.Client
	logger *slog.Logger
}

func NewHandler(store *db.Store, solrClient *solr.Client, logger *slog.Logger) *Handler {
	return &Handler{
		store:  store,
		solr:   solrClient,
		logger: logger,
	}
}

func (h *Handler) HandleBook(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	idParam := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idParam, 10, 64)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid id parameter")
		return
	}

	h.logger.Info("processing book update", "id", id)

	// Get book record from MySQL (read-only)
	book, err := h.store.GetBook(ctx, id)
	if err != nil {
		if err == sql.ErrNoRows {
			respondError(w, http.StatusNotFound, "book not found")
			return
		}
		h.logger.Error("failed to get book", "id", id, "error", err)
		respondError(w, http.StatusInternalServerError, "database error")
		return
	}

	// Prepare Solr document
	doc := map[string]any{
		"id":          fmt.Sprintf("book-%d", book.ID),
		"sku":         fmt.Sprintf("book-%d", book.ID),
		"type_s":      "book",
		"cat":         []string{"books"},
		"name":        book.Title,
		"author_s":    book.Author,
		"genre_s":     book.Genre,
		"price":       book.Price,
		"inStock":     book.InStock,
		"isbn_s":      book.ISBN,
		"description": book.Description,
	}

	// Update Solr
	if err := h.solr.UpdateDoc(ctx, "books", doc); err != nil {
		h.logger.Error("failed to update solr", "collection", "books", "id", id, "error", err)
		respondError(w, http.StatusBadGateway, "failed to update solr")
		return
	}

	h.logger.Info("book synced successfully", "id", id)
	respondJSON(w, http.StatusOK, map[string]any{
		"resource": "books",
		"id":       id,
		"status":   "synced",
		"message":  fmt.Sprintf("Book %d updated and synced to Solr", id),
	})
}

func (h *Handler) HandleElectronic(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	idParam := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idParam, 10, 64)
	if err != nil {
		respondError(w, http.StatusBadRequest, "invalid id parameter")
		return
	}

	h.logger.Info("processing electronics update", "id", id)

	// Get electronics record from MySQL (read-only)
	electronic, err := h.store.GetElectronic(ctx, id)
	if err != nil {
		if err == sql.ErrNoRows {
			respondError(w, http.StatusNotFound, "electronic not found")
			return
		}
		h.logger.Error("failed to get electronic", "id", id, "error", err)
		respondError(w, http.StatusInternalServerError, "database error")
		return
	}

	// Prepare Solr document
	doc := map[string]any{
		"id":             fmt.Sprintf("electronics-%d", electronic.ID),
		"sku":            fmt.Sprintf("electronics-%d", electronic.ID),
		"type_s":         "electronics",
		"cat":            []string{"electronics"},
		"name":           electronic.Name,
		"manu":           electronic.Manufacturer,
		"manufacturer_s": electronic.Manufacturer,
		"price":          electronic.Price,
		"inStock":        electronic.InStock,
		"description":    electronic.Description,
		"specs_txt":      electronic.Specs,
	}

	// Update Solr
	if err := h.solr.UpdateDoc(ctx, "electronics", doc); err != nil {
		h.logger.Error("failed to update solr", "collection", "electronics", "id", id, "error", err)
		respondError(w, http.StatusBadGateway, "failed to update solr")
		return
	}

	h.logger.Info("electronic synced successfully", "id", id)
	respondJSON(w, http.StatusOK, map[string]any{
		"resource": "electronics",
		"id":       id,
		"status":   "synced",
		"message":  fmt.Sprintf("Electronic %d updated and synced to Solr", id),
	})
}

func respondJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{
		"error": message,
	})
}

