# Rabby Agent Entry

This repository keeps shared agent skills in `skills/*/SKILL.md`.

For Codex-style agents, start with `.codex/SKILL.md`. It explains how to discover and load repo-local skills without duplicating skill bodies under `.codex/`.

## Wallet Security Invariants

These invariants hold for every change. Reviewers must check them even when a PR does not touch security code directly, and any audit task must load `skills/rabby-security-review/SKILL.md`.

- Consent does not survive re-authentication. Lock, unlock, account switch, and chain switch are session boundaries: any pending approval, signature request, or permission prompt must be rejected or re-confirmed across them. Check what happens to `notificationService.currentApproval` on `lock`.
- `resolveApproval` / `rejectApproval` must always be called with an `approvalId`, and callers must verify `approvalComponent`. A resolve without an id resolves *whatever is pending* — treat any such caller as a finding.
- Signing paths must fail closed: an undefined or mismatched `approvalRes` must reject the request, never sign. `approvalRes?.extra`-style tolerance downstream of an approval is fail-open.
- `broadcastToUI` events reach every window (popup, notification, tab). A listener must not treat a global event (e.g. `UNLOCK_WALLET`) as local user consent for a pending request in its own window.
- Membership in a relaxation whitelist (e.g. `QUEUE_APPROVAL_COMPONENTS_WHITELIST`) means the component can coexist with other queued approvals; every member must be coexistence-safe.

## KeeperHub MCP Integration

This project includes a KeeperHub Model Context Protocol (MCP) server integration for AI-powered blockchain workflow generation. Key details:

- **Configuration**: `.devin/mcp_config.json` (project) and `.devin/mcp_config.local.json` (local, gitignored)
- **Service**: `src/background/service/keeperhubMCP.ts` - TypeScript wrapper for KeeperHub MCP API
- **Types**: `src/background/service/keeperhubMCPTypes.ts` - Comprehensive type definitions
- **Templates**: `src/ui/views/SmartAutomations/workflowTemplates.ts` - AI workflow generation functions
- **Documentation**: `docs/keeperhub-mcp-integration.md` - Complete integration guide

When working with KeeperHub features:
- The MCP service shares API key storage with the existing `keeperhubService` for consistency
- Workflow generation uses AI instead of manual JSON construction to avoid schema mismatches
- All MCP operations include comprehensive error handling and validation
- API keys should never be committed - use environment variables or local config files

See the integration documentation for detailed API reference and usage examples.

