#!/usr/bin/env bash
# Idempotent one-shot provisioning for docker-compose.observability.yml.
#   setup.sh elasticsearch  -> kibana_system password, log-writer role/user, data stream template + retention
#   setup.sh kibana         -> data view and saved troubleshooting searches
set -euo pipefail

ES=http://elasticsearch:9200
KIBANA=http://kibana:5601
AUTH="elastic:${ELASTIC_PASSWORD}"

call() { # method url body
  local code
  code=$(curl -s -o /tmp/response -w '%{http_code}' -u "$AUTH" -X "$1" "$2" \
    -H 'Content-Type: application/json' -H 'kbn-xsrf: setup' --data-binary "$3")
  if [ "$code" -ge 300 ]; then echo "$1 $2 failed with $code: $(cat /tmp/response)" >&2; exit 1; fi
  echo "$1 $2 -> $code"
}

provision_elasticsearch() {
  call POST "$ES/_security/user/kibana_system/_password" "{\"password\":\"${KIBANA_SYSTEM_PASSWORD}\"}"

  # Filebeat may only append to the application log streams: no reads, deletes or cluster changes.
  call PUT "$ES/_security/role/rehletshifaa_log_writer" '{
    "cluster": ["monitor"],
    "indices": [{"names": ["logs-rehletshifaa-*"], "privileges": ["create_doc", "auto_configure"]}]
  }'
  call PUT "$ES/_security/user/rehletshifaa_log_writer" \
    "{\"password\":\"${LOG_WRITER_PASSWORD}\",\"roles\":[\"rehletshifaa_log_writer\"]}"

  # One data stream per environment namespace, built on Elasticsearch's own logs + ECS mappings so the
  # backend and gateway fields (http.request.id, log.level, event.code, error.*) are typed, not guessed.
  # Retention uses the data stream lifecycle; prefer_ilm=false keeps the built-in logs ILM policy out.
  call PUT "$ES/_index_template/logs-rehletshifaa" "{
    \"index_patterns\": [\"logs-rehletshifaa-*\"],
    \"data_stream\": {},
    \"priority\": 300,
    \"composed_of\": [\"logs@mappings\", \"logs@settings\", \"ecs@mappings\"],
    \"template\": {
      \"settings\": {\"index.lifecycle.prefer_ilm\": false, \"index.number_of_replicas\": 0},
      \"mappings\": {\"properties\": {\"gateway\": {\"properties\": {
        \"upstream_status\": {\"type\": \"keyword\"}, \"request_time_seconds\": {\"type\": \"float\"}}}}},
      \"lifecycle\": {\"data_retention\": \"${LOG_RETENTION}\"}
    },
    \"_meta\": {\"description\": \"RehletShifaa backend and api-gateway ECS logs\"}
  }"
  # Apply a changed LOG_RETENTION to streams that already exist (the template only affects new ones).
  if curl -s -f -o /dev/null -u "$AUTH" "$ES/_data_stream/logs-rehletshifaa-*"; then
    call PUT "$ES/_data_stream/logs-rehletshifaa-*/_lifecycle" "{\"data_retention\":\"${LOG_RETENTION}\"}"
  fi
}

provision_kibana() {
  local code
  code=$(curl -s -o /tmp/response -w '%{http_code}' -u "$AUTH" -X POST "$KIBANA/api/saved_objects/_import?overwrite=true" \
    -H 'kbn-xsrf: setup' -F file=@/setup/kibana-objects.ndjson)
  if [ "$code" -ge 300 ] || ! grep -q '"success":true' /tmp/response; then
    echo "Kibana saved-object import failed with $code: $(cat /tmp/response)" >&2; exit 1
  fi
  echo "Kibana saved objects imported"
}

case "${1:-}" in
  elasticsearch) provision_elasticsearch ;;
  kibana) provision_kibana ;;
  *) echo "usage: setup.sh elasticsearch|kibana" >&2; exit 2 ;;
esac
