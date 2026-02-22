#!/bin/bash
# format-log.sh — Post-processing filter for Claude stream-json output
# Transforms stream-json lines into markdown output that renders in VS Code,
# GitHub, and any markdown viewer.
#
# Why markdown? Raw JSON walls are unreadable. Plain-text [PREFIX] lines don't
# render in previews. Markdown gives structure (headers, code blocks, tables)
# that tools already understand — no custom viewer needed.
#
# Usage:
#   cat log.json | ./format-log.sh          # Pipe mode (real-time during loop)
#   ./format-log.sh < log.json              # Review mode (re-process saved JSON)
#   THINK_MAX_CHARS=500 ./format-log.sh     # Custom truncation
#
# Environment variables:
#   THINK_MAX_CHARS       Max chars for thinking preview (default: 200)
#   RESULT_MAX_CHARS      Max chars for tool result content (default: 500)
#   TOOL_ARGS_MAX_CHARS   Max chars for tool_use input display (default: 120)

THINK_MAX_CHARS="${THINK_MAX_CHARS:-200}"
RESULT_MAX_CHARS="${RESULT_MAX_CHARS:-500}"
TOOL_ARGS_MAX_CHARS="${TOOL_ARGS_MAX_CHARS:-120}"

truncate_str() {
    local text="$1"
    local max="$2"
    if [ "${#text}" -gt "$max" ]; then
        printf '%s' "${text:0:$max}..."
    else
        printf '%s' "$text"
    fi
}

format_number() {
    local num="${1%%.*}"
    local sign=""
    if [[ "$num" == -* ]]; then
        sign="-"
        num="${num#-}"
    fi
    local result=""
    local len=${#num}
    for ((i=0; i<len; i++)); do
        if [ $i -gt 0 ] && [ $(( (len - i) % 3 )) -eq 0 ]; then
            result="${result},"
        fi
        result="${result}${num:$i:1}"
    done
    printf '%s%s' "$sign" "$result"
}

format_duration() {
    local ms="$1"
    # Handle decimal ms values from jq
    ms="${ms%%.*}"
    local total_secs=$(( ms / 1000 ))
    local mins=$(( total_secs / 60 ))
    local secs=$(( total_secs % 60 ))
    if [ "$mins" -gt 0 ]; then
        printf '%dm %ds' "$mins" "$secs"
    else
        printf '%ds' "$secs"
    fi
}

while IFS= read -r line || [ -n "$line" ]; do
    # Single jq call per line: classify event type and produce markdown output.
    # Outputs SUMMARY: prefix for result/success data needing bash number/duration
    # formatting; everything else is markdown emitted directly.
    if ! formatted=$(printf '%s' "$line" | jq -r \
        --arg think_max "$THINK_MAX_CHARS" \
        --arg result_max "$RESULT_MAX_CHARS" \
        --arg tool_max "$TOOL_ARGS_MAX_CHARS" '

        def trunc($m): if length > ($m | tonumber) then .[0:($m | tonumber)] + "..." else . end;

        if .type == "system" and .subtype == "init" then
            "## Session: \(now | strftime("%Y-%m-%d %H:%M:%S"))",
            "",
            "**Model:** \(.model // "unknown") | **Mode:** \(.permissionMode // "unknown") | **Tools:** \(.tools | length)",
            "",
            "---"

        elif .type == "system" and .subtype == "task_started" then
            "### Subagent",
            "",
            "> \(.description // "unknown") (task_id=\((.task_id // "unknown")[0:8]))"

        elif .type == "assistant" then
            (.message.content // [] | .[] |
                if .type == "thinking" then
                    "### Thinking",
                    "",
                    "> " + ((.thinking // "") | gsub("\n"; " ") | trunc($think_max))
                elif .type == "text" then
                    "### Assistant",
                    "",
                    (.text // "")
                elif .type == "tool_use" then
                    "### Tool: `\(.name // "unknown")`",
                    "",
                    "```",
                    ((.input // {}) | to_entries | map(
                        .key + "=\"" + (.value | tostring | .[0:60]) + "\""
                    ) | join(", ") | trunc($tool_max)),
                    "```"
                else
                    "*Unknown event: type=assistant content_type=\(.type)*"
                end
            )

        elif .type == "user" then
            (.message.content // [] | .[] |
                if .type == "tool_result" then
                    if .is_error == true then
                        "### Error",
                        "",
                        "```",
                        ((.content // "") | tostring | gsub("\n"; " ") | trunc($result_max)),
                        "```"
                    else
                        "### Result",
                        "",
                        "```",
                        ((.content // "") | tostring | gsub("\n"; " ") | trunc($result_max)),
                        "```"
                    end
                else
                    "*Unknown event: type=user content_type=\(.type)*"
                end
            )

        elif .type == "rate_limit_event" then
            "*Rate limit: \(.rate_limit_info.status // "unknown")*"

        elif .type == "result" and .subtype == "success" then
            "SUMMARY:\(.duration_ms // 0)\t\(.duration_api_ms // 0)\t\(.num_turns // 0)\t\(.total_cost_usd // 0)\t\(.usage.input_tokens // 0)\t\(.usage.output_tokens // 0)\t\(.usage.cache_read_input_tokens // 0)\t\(.usage.cache_creation_input_tokens // 0)\t\((.modelUsage | keys[0]) // "unknown")"

        elif .type == "result" then
            "*Unknown event: type=result subtype=\(.subtype // "")*"

        else
            "*Unknown event: type=\(.type // "") subtype=\(.subtype // "")*"
        end
    ' 2>/dev/null); then
        # Not valid JSON — pass through as-is (e.g. git output, loop banners)
        echo "$line"
        continue
    fi

    # Empty output from jq (shouldn't happen but guard against it)
    if [ -z "$formatted" ]; then
        echo "$line"
        continue
    fi

    # Process each output line from jq
    while IFS= read -r out_line; do
        if [[ "$out_line" == SUMMARY:* ]]; then
            # Parse tab-separated summary fields for bash number/duration formatting
            data="${out_line#SUMMARY:}"
            IFS=$'\t' read -r dur api_dur turns cost input_tok output_tok cache_read cache_create model <<< "$data"
            echo ""
            echo "---"
            echo ""
            echo "## Session Complete"
            echo ""
            echo "| Metric | Value |"
            echo "|--------|-------|"
            printf '| Duration | %s (API: %s) |\n' "$(format_duration "$dur")" "$(format_duration "$api_dur")"
            printf '| Turns | %s |\n' "$turns"
            printf '| Cost | $%.2f |\n' "$cost"
            printf '| Model | %s |\n' "$model"
            printf '| Input | %s tokens |\n' "$(format_number "$input_tok")"
            printf '| Output | %s tokens |\n' "$(format_number "$output_tok")"
            printf '| Cache | %s read / %s created |\n' "$(format_number "$cache_read")" "$(format_number "$cache_create")"
        else
            echo "$out_line"
        fi
    done <<< "$formatted"
done
