#!/bin/sh
set -eu

echo "Initializing Solr cores with sample_techproducts_configs..."

CONFIGSET=sample_techproducts_configs
CORES=(books electronics)

for core in "${CORES[@]}"; do
  if [ ! -d "/var/solr/data/${core}" ]; then
    echo "Creating Solr core: ${core} using configset ${CONFIGSET}"
    precreate-core "${core}" "/opt/solr/server/solr/configsets/${CONFIGSET}"
  else
    echo "Core ${core} already exists, skipping creation"
  fi
done

echo "Solr initialization complete"


