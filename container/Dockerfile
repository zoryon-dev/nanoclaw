# syntax=docker/dockerfile:1.7
# NanoClaw Agent Container
# Runs Claude Agent SDK in isolated Linux VM with browser automation.
#
# Runtime split:
#   - agent-runner (our TypeScript code): Bun, mounted RO at /app/src by host
#   - globally-installed Node CLIs (claude-code, agent-browser, vercel): pnpm + Node
#
# Source is never baked in — /app/src is provided by a shared read-only
# bind mount at runtime (see src/container-runner.ts). Source-only changes
# never require an image rebuild.

FROM node:22-slim

# ---- Build-time arguments ----------------------------------------------------
# CJK fonts add ~200MB. Opt in only if you render Chinese/Japanese/Korean text.
ARG INSTALL_CJK_FONTS=false

# Pin versions for reproducibility. Bump deliberately — unpinned installs mean
# every rebuild silently picks up the latest and can break in lockstep across
# all users. The global Node CLIs (claude-code, agent-browser, vercel) are
# pinned in cli-tools.json so a skill can add one with a json-merge; Bun (the
# runtime) is pinned here because it installs from a different source.
ARG BUN_VERSION=1.3.12
# yt-dlp for the /watch skill. Standalone zipapp (needs the python3 we install
# below). Pin deliberately — yt-dlp ships frequent releases. Verify the tag
# resolves before bumping (the build 404s loudly if it doesn't).
ARG YT_DLP_VERSION=2026.06.09
# gallery-dl for the /read-post skill (image carousels). Pin deliberately.
ARG GALLERY_DL_VERSION=1.32.3

# ---- System dependencies -----------------------------------------------------
# tini: correct PID 1 / signal forwarding so outbound.db writes finalize on
# SIGTERM instead of being orphaned by the shell entrypoint.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
        chromium \
        ffmpeg \
        python3 \
        python3-pip \
        fonts-liberation \
        fonts-noto-color-emoji \
        libgbm1 \
        libnss3 \
        libatk-bridge2.0-0 \
        libgtk-3-0 \
        libx11-xcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxrandr2 \
        libasound2 \
        libpangocairo-1.0-0 \
        libcups2 \
        libdrm2 \
        libxshmfence1 \
        ca-certificates \
        curl \
        git \
        tini \
        unzip \
    && if [ "$INSTALL_CJK_FONTS" = "true" ]; then \
        apt-get install -y --no-install-recommends fonts-noto-cjk; \
       fi \
    && rm -rf /var/lib/apt/lists/*

# ---- /watch skill runtime: yt-dlp -------------------------------------------
# ffmpeg/ffprobe (apt, above) + python3 (apt, above) + the yt-dlp zipapp.
# download.py/frames.py shell out to these binaries; no pip packages needed.
RUN curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/yt-dlp" \
        -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp

# ---- /read-post skill runtime: gallery-dl -----------------------------------
# Image-post / carousel downloader (Instagram, TikTok slideshows, X). yt-dlp is
# video-only; gallery-dl pulls all carousel cards + post metadata. Pinned.
RUN pip3 install --no-cache-dir --break-system-packages "gallery-dl==${GALLERY_DL_VERSION}"

# Chromium path for agent-browser / Playwright consumers
ENV AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
# Belt-and-braces: prevent Playwright's postinstall from downloading its own
# ~300MB Chromium. We've already installed the system one above.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# ---- mnemon — persistent agent memory ----------------------------------------
ARG MNEMON_VERSION=0.1.16
RUN ARCH=$(dpkg --print-architecture) && \
    curl -fsSL "https://github.com/mnemon-dev/mnemon/releases/download/v${MNEMON_VERSION}/mnemon_${MNEMON_VERSION}_linux_${ARCH}.tar.gz" \
    | tar -xz -C /usr/local/bin mnemon && \
    chmod +x /usr/local/bin/mnemon

ENV MNEMON_DATA_DIR=/home/node/.claude/mnemon

# ---- Bun runtime -------------------------------------------------------------
# Install via the official script (handles multi-arch detection), then move
# the binary to /usr/local/bin so the non-root `node` user can execute it.
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" && \
    install -m 0755 /root/.bun/bin/bun /usr/local/bin/bun && \
    rm -rf /root/.bun

# ---- agent-runner deps -------------------------------------------------------
# Deps are cached independently of CLI versions. Source is NOT baked in —
# it's provided by the shared RO mount at runtime.
WORKDIR /app

COPY agent-runner/package.json agent-runner/bun.lock ./

RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

# ---- pnpm + global Node CLIs -------------------------------------------------
# Most stable first, most frequently bumped last. Bumping claude-code
# (the most common change) only invalidates one layer.
#
# only-built-dependencies gates pnpm's supply-chain policy:
#   - agent-browser has a postinstall build step.
#   - @anthropic-ai/claude-code's postinstall downloads the native Claude
#     binary (linux-arm64 variant on our image). Without the allowlist
#     the SDK fails at spawn time with "native binary not found".
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# Pin pnpm to match the host (package.json packageManager). pnpm 11 stopped
# honoring `only-built-dependencies[]=` in .npmrc for global installs, which
# silently skips claude-code's native-binary postinstall and agent-browser's
# bin chmod — the agent then crashes at runtime with "native binary not
# installed". Keep this in lockstep with package.json's `packageManager`.
ARG PNPM_VERSION=10.33.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Global Node CLIs the agent invokes at runtime live in cli-tools.json so a
# skill can add one with a json-merge instead of editing this Dockerfile.
# install-cli-tools.sh installs each via pnpm (pinned), writing the per-tool
# only-built-dependencies opt-ins it reads from the manifest.
COPY cli-tools.json install-cli-tools.sh /tmp/
RUN --mount=type=cache,target=/root/.cache/pnpm \
    sh /tmp/install-cli-tools.sh /tmp/cli-tools.json

# ---- uv + Python 3.12 + Tavily CLI (research toolkit) ------------------------
# uv (pinned, copied from the official static image — NO curl|bash, NO remote
# script at build) gives us two things the research skills need:
#   (1) a relocatable CPython 3.12 — the `last30days` skill hard-requires 3.12+
#       and the base image ships 3.11; exposed as `python3.12` (base `python3`
#       stays 3.11 so existing scripts are untouched).
#   (2) the Tavily CLI (PyPI `tavily-cli`, pinned) as `tvly` — its key is injected
#       by the OneCLI gateway at runtime (api.tavily.com); no key in the image.
# Tool/python dirs are world-readable so the non-root agent user can run them.
COPY --from=ghcr.io/astral-sh/uv:0.11.23 /uv /usr/local/bin/uv
ENV UV_PYTHON_INSTALL_DIR=/opt/uv/python \
    UV_TOOL_DIR=/opt/uv/tools \
    UV_TOOL_BIN_DIR=/usr/local/bin
RUN uv python install 3.12 && \
    ln -sf "$(uv python find 3.12)" /usr/local/bin/python3.12 && \
    uv tool install "tavily-cli==0.1.4" && \
    chmod -R a+rX /opt/uv && \
    python3.12 --version && /usr/local/bin/tvly --version

# ---- finance-csv CLI ---------------------------------------------------------
# Local multi-file Node skill (parsers + xlsx). Isolated install into
# /usr/local/lib so its single dep (xlsx) never touches the pnpm global store.
COPY skills/finance-csv/lib /usr/local/lib/finance-csv
COPY skills/finance-csv/package.json /usr/local/lib/finance-csv/package.json
COPY skills/finance-csv/finance-csv /usr/local/bin/finance-csv
RUN cd /usr/local/lib/finance-csv && npm install --omit=dev --no-audit --no-fund \
    && chmod +x /usr/local/bin/finance-csv

# ---- ncl CLI wrapper ----------------------------------------------------------
# Actual script lives in the mounted source at /app/src/cli/ncl.ts.
RUN printf '#!/bin/sh\nexec bun /app/src/cli/ncl.ts "$@"\n' > /usr/local/bin/ncl && \
    chmod +x /usr/local/bin/ncl

# ---- Entrypoint --------------------------------------------------------------
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# ---- Workspace + permissions -------------------------------------------------
RUN mkdir -p /workspace/group /workspace/extra && \
    chown -R node:node /workspace && \
    chmod 777 /home/node

USER node
WORKDIR /workspace/group

# tini is PID 1, reaps zombies, forwards signals cleanly. entrypoint.sh does
# `exec bun ...` so bun runs as tini's direct child.
ENTRYPOINT ["/usr/bin/tini", "--", "/app/entrypoint.sh"]
