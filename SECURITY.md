# Security policy

## Supported versions

Security fixes are released against the latest published version of the
Orbit MCP Server in [`postmanlabs/orbit-mcp-server`](https://github.com/postmanlabs/orbit-mcp-server).
Please use the latest revision (or the hosted server) before reporting an issue.

## Reporting a vulnerability

**Please don't report security vulnerabilities through public GitHub issues,
pull requests, or community forums.**

Report privately through either of these channels:

- **Postman security** — email [security@postman.com](mailto:security@postman.com)
  and follow the [Postman vulnerability reporting process](https://www.postman.com/security/vulnerability-reporting/)
  (HackerOne invite is issued from that inbox).
- **GitHub private vulnerability reporting** —
  [Report a vulnerability](https://github.com/postmanlabs/orbit-mcp-server/security/advisories/new)
  (also reachable from the **Security** tab of this repository), if that form is enabled.

Please use Postman's [PGP public key](https://assets.getpostman.com/getpostman/documents/publickey.txt)
to encrypt email if you can.

### What to include

The more of this you can provide, the faster we can confirm and fix:

- How you are running the server (hosted `https://mcp.buildwithorbit.ai/mcp`,
  Docker, or from source).
- The version or git commit, if you are self-hosting.
- The impact — what an attacker can do, and what access they would need.
- Steps to reproduce, or a proof of concept.
- Any suggested mitigation, if you have one.

**Don't include live secrets, tokens, or private data** in your report.
Redact them, and rotate anything that may have been exposed.

### What to expect

We'll acknowledge your report, keep you updated as we investigate, and
coordinate disclosure with you before publishing a fix. If you'd like credit
in the advisory, say so and tell us how you'd like to be named.

## Scope

This policy covers the Orbit MCP Server distributed from this repository and
the hosted endpoint at `https://mcp.buildwithorbit.ai/mcp`.

Vulnerabilities in the **Postman platform or the Postman API itself** — rather
than in this server — should go through the
[Postman security policy](https://www.postman.com/legal/security-policy/),
which covers Postman's bug bounty and disclosure process.
