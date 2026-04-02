import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import { useAppState, useSetAppState } from "../state/AppState.js";
import { fuzzyMatchFiles } from "../utils/fileResolver.js";

interface InputBarProps {
  disabled: boolean;
  onSubmit: (text: string) => void;
}

/**
 * Extract the active @ token from input (the partial after the last unfinished @).
 * Returns null if there's no active @ token.
 */
function getActiveAtToken(input: string): string | null {
  // Find the last @ that's followed by non-space chars (or is at end)
  const lastAt = input.lastIndexOf("@");
  if (lastAt === -1) return null;

  const after = input.slice(lastAt + 1);
  // If there's a space after the @-token, it's completed — no autocomplete
  if (after.includes(" ")) return null;
  // Must have at least one character after @
  if (after.length === 0) return null;

  return after;
}

export function InputBar({ disabled, onSubmit }: InputBarProps) {
  const [input, setInput] = useState("");
  const { focusOwner } = useAppState();
  const setState = useSetAppState();

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAutocompleting = suggestions.length > 0;

  // Debounced autocomplete matching — only re-run when input changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const partial = getActiveAtToken(input);
    if (!partial) {
      setSuggestions([]);
      setSelectedSuggestion(0);
      setState((s) =>
        s.focusOwner === "autocomplete" ? { ...s, focusOwner: "input" } : s
      );
      return;
    }

    debounceRef.current = setTimeout(() => {
      fuzzyMatchFiles(partial, process.cwd(), 8)
        .then((results) => {
          setSuggestions(results);
          setSelectedSuggestion(0);
          if (results.length > 0) {
            setState((s) =>
              s.focusOwner === "input" ? { ...s, focusOwner: "autocomplete" } : s
            );
          } else {
            setState((s) =>
              s.focusOwner === "autocomplete" ? { ...s, focusOwner: "input" } : s
            );
          }
        })
        .catch(() => {
          setSuggestions([]);
        });
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  useInput((inputChar, key) => {
    if (disabled) return;
    if (focusOwner === "diffViewer") return;

    // Autocomplete-only keys (consume and return)
    if (isAutocompleting && focusOwner === "autocomplete") {
      if (key.downArrow) {
        setSelectedSuggestion((prev) => Math.min(prev + 1, suggestions.length - 1));
        return;
      }
      if (key.upArrow) {
        setSelectedSuggestion((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (key.tab) {
        // Complete with selected suggestion
        const selected = suggestions[selectedSuggestion];
        if (selected) {
          const lastAt = input.lastIndexOf("@");
          const before = input.slice(0, lastAt + 1);
          setInput(before + selected + " ");
          setSuggestions([]);
          setSelectedSuggestion(0);
          setState((s) => ({ ...s, focusOwner: "input" }));
        }
        return;
      }
      if (key.escape) {
        setSuggestions([]);
        setSelectedSuggestion(0);
        setState((s) => ({ ...s, focusOwner: "input" }));
        return;
      }
      // All other keys (Enter, Backspace, characters) fall through
      // so normal typing continues while autocomplete is visible
    }

    if (key.return) {
      // Dismiss autocomplete if active, then submit
      if (isAutocompleting) {
        setSuggestions([]);
        setSelectedSuggestion(0);
        setState((s) =>
          s.focusOwner === "autocomplete" ? { ...s, focusOwner: "input" } : s
        );
      }
      const trimmed = input.trim();
      if (trimmed) {
        onSubmit(trimmed);
        setInput("");
        setSuggestions([]);
        setSelectedSuggestion(0);
      }
      return;
    }

    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      return;
    }

    // Ctrl+C is handled by Ink's exit, Ctrl+U clears line
    if (inputChar && key.ctrl && inputChar === "u") {
      setInput("");
      setSuggestions([]);
      setSelectedSuggestion(0);
      return;
    }

    // Regular character input — always works regardless of focusOwner
    if (inputChar && !key.ctrl && !key.meta) {
      setInput((prev) => prev + inputChar);
    }
  });

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Text color={disabled ? "gray" : "green"} bold>
          {"❯ "}
        </Text>
        <Text dimColor={disabled}>
          {input}
          {!disabled && <Text color="gray">█</Text>}
        </Text>
      </Box>

      {/* Autocomplete suggestions */}
      {isAutocompleting && !disabled && (
        <Box flexDirection="column" marginLeft={2} marginTop={0}>
          {suggestions.map((suggestion, i) => (
            <Text
              key={suggestion}
              color={i === selectedSuggestion ? "cyan" : "gray"}
              bold={i === selectedSuggestion}
            >
              {i === selectedSuggestion ? "> " : "  "}
              {suggestion}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
