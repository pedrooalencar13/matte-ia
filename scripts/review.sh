#!/bin/bash
# Mostra decisões com revisão pendente
echo "=== DECISÕES COM REVISÃO PENDENTE ==="
TODAY=$(date +%Y-%m-%d)
echo "Data atual: $TODAY"
echo ""
grep -A4 "Revisão:" memory/decisions.md | while IFS= read -r line; do
  if echo "$line" | grep -q "Revisão:"; then
    REVISAO=$(echo "$line" | grep -o "[0-9]\{2\}/[0-9]\{2\}/[0-9]\{4\}" | head -1)
    if [ ! -z "$REVISAO" ]; then
      # Converter DD/MM/YYYY para YYYY-MM-DD para comparação
      REV_ISO=$(echo "$REVISAO" | awk -F'/' '{print $3"-"$2"-"$1}')
      if [[ "$REV_ISO" <= "$TODAY" ]]; then
        echo "  REVIEW DUE: $REVISAO"
      fi
    fi
  fi
done
echo ""
echo "=================================="
