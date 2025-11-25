package solr

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// UpdateDoc updates or inserts a document in a Solr collection
func (c *Client) UpdateDoc(ctx context.Context, collection string, doc map[string]any) error {
	url := fmt.Sprintf("%s/%s/update?commit=true", c.baseURL, collection)

	// Wrap document in an array for Solr's JSON update format
	payload := []map[string]any{doc}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal document: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("solr returned status %d", resp.StatusCode)
	}

	// Parse response to check for errors
	var result struct {
		ResponseHeader struct {
			Status int `json:"status"`
		} `json:"responseHeader"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("failed to decode response: %w", err)
	}

	if result.ResponseHeader.Status != 0 {
		return fmt.Errorf("solr update failed with status %d", result.ResponseHeader.Status)
	}

	return nil
}

