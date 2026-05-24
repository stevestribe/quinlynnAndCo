/**
 * Playwright tests for the Quinlynn & Co. staging admin.
 *
 * GitHub API is intercepted and mocked so tests run without credentials.
 * The iframe uses srcdoc and is same-origin, so we can inspect it via
 * frameLocator and waitForFunction against document.getElementById('adm-frame').
 */

const { test, expect } = require('@playwright/test');

// ── Mock data ────────────────────────────────────────────────────────────────

const MOCK_MD = `---
title: Home
---

## labels

### about
About

### products
Products

### contact
Contact

## hero

### title
*Handcrafted* goods for your home

### sub
Made with love and care

## about

### heading
Our Story

### bio1
First paragraph of bio.

### quote
Life is better with handmade things.

### bio2
Second paragraph of bio.

### sign
Quinlynn

### meta
Portland, OR
Est. 2019
Ships nationwide

## products

### heading
What We Make

### card1
Linen Tea Towel | $28 | Bestseller
Heavyweight 100% linen

### card2
Beeswax Candle | $22 | New
100% pure beeswax

### card3
Ceramic Mug | $38 |
Wheel-thrown stoneware

### card4
Herb Bundle | $18 | Seasonal
Dried sage and lavender

### card5
Wool Throw | $145 | Limited
Single-ply merino wool

### card6
Gift Set | $72 | Popular
Towel, candle, and mug

## inquire

### heading
Let's Connect

### lede
I'd love to hear from you.

### thanks-h
Thank You

### thanks-p
Your message has been received.

## footer

### tagline
Slow goods for a slower life.
`;

const MOCK_SHA = 'abc123def456abc123def456abc123def456abc1';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function mockGitHubAPI(page) {
  const contentB64 = Buffer.from(MOCK_MD).toString('base64');

  await page.route('https://api.github.com/**', async route => {
    const url    = route.request().url();
    const method = route.request().method();

    if (url.includes('/contents/') && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sha: MOCK_SHA, content: contentB64 }),
      });
    } else if (url.includes('/contents/') && method === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ content: { sha: 'newsha456' } }),
      });
    } else if (url.includes('/dispatches')) {
      await route.fulfill({ status: 204 });
    } else {
      await route.continue();
    }
  });
}

async function connectWithToken(page) {
  await page.fill('#token-input', 'github_pat_test_token_XXXXXXXXXXXXXX');
  await page.click('button[type="submit"]');
}

async function waitForIframe(page) {
  // Wait until the srcdoc iframe has loaded and pencil buttons are injected
  await page.waitForFunction(() => {
    const f = document.getElementById('adm-frame');
    return f && f.contentDocument && !!f.contentDocument.querySelector('.qc-pencil');
  }, { timeout: 10000 });
}

async function openFieldPopup(page, key) {
  const iframeLocator = page.frameLocator('#adm-frame');
  await iframeLocator.locator(`.qc-pencil[data-qc-key="${key}"]`).click();
  await expect(page.locator('#adm-popup')).toBeVisible();
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Token dialog', () => {
  test.beforeEach(async ({ page }) => {
    await mockGitHubAPI(page);
    await page.goto('/admin/');
  });

  test('shows on first load', async ({ page }) => {
    await expect(page.locator('#token-dialog')).toBeVisible();
    await expect(page.locator('#token-input')).toBeVisible();
  });

  test('Cancel closes the dialog', async ({ page }) => {
    await page.click('#token-cancel-btn');
    await expect(page.locator('#token-dialog')).not.toBeVisible();
  });

  test('clicking backdrop closes the dialog', async ({ page }) => {
    // Click top-left corner of the dialog backdrop
    await page.locator('#token-dialog').click({ position: { x: 5, y: 5 }, force: true });
    await expect(page.locator('#token-dialog')).not.toBeVisible();
  });

  test('shows inline error for empty token submission', async ({ page }) => {
    await page.click('button[type="submit"]');
    await expect(page.locator('#token-error')).toBeVisible();
    await expect(page.locator('#token-error')).toContainText('token');
  });

  test('connects, loads content, and shows Ready status', async ({ page }) => {
    await connectWithToken(page);
    await expect(page.locator('#token-dialog')).not.toBeVisible();
    await expect(page.locator('#adm-status')).toContainText('Ready', { timeout: 8000 });
  });
});

test.describe('Pencil buttons', () => {
  test.beforeEach(async ({ page }) => {
    await mockGitHubAPI(page);
    await page.goto('/admin/');
    await connectWithToken(page);
    await waitForIframe(page);
  });

  test('are rendered inside the iframe for each field', async ({ page }) => {
    const iframeLocator = page.frameLocator('#adm-frame');
    // Should have at least one pencil per section
    await expect(iframeLocator.locator('.qc-pencil[data-qc-key="hero-title"]')).toBeAttached();
    await expect(iframeLocator.locator('.qc-pencil[data-qc-key="hero-sub"]')).toBeAttached();
    await expect(iframeLocator.locator('.qc-pencil[data-qc-key="about-heading"]')).toBeAttached();
    await expect(iframeLocator.locator('.qc-pencil[data-qc-key="footer-tagline"]')).toBeAttached();
  });

  test('toggle hides pencils and removes is-active from button', async ({ page }) => {
    const toggleBtn    = page.locator('#adm-pencils-toggle');
    const iframeLocator = page.frameLocator('#adm-frame');

    await expect(toggleBtn).toHaveClass(/is-active/);

    await toggleBtn.click();

    await expect(toggleBtn).not.toHaveClass(/is-active/);
    await expect(iframeLocator.locator('body')).toHaveClass(/no-pencils/);
  });

  test('toggle re-shows pencils on second click', async ({ page }) => {
    const toggleBtn    = page.locator('#adm-pencils-toggle');
    const iframeLocator = page.frameLocator('#adm-frame');

    await toggleBtn.click(); // hide
    await toggleBtn.click(); // show again

    await expect(toggleBtn).toHaveClass(/is-active/);
    await expect(iframeLocator.locator('body')).not.toHaveClass(/no-pencils/);
  });
});

test.describe('Field popup', () => {
  test.beforeEach(async ({ page }) => {
    await mockGitHubAPI(page);
    await page.goto('/admin/');
    await connectWithToken(page);
    await waitForIframe(page);
  });

  test('clicking a pencil opens popup with correct label', async ({ page }) => {
    await openFieldPopup(page, 'hero-title');
    await expect(page.locator('#adm-popup-label')).toContainText('Hero headline');
  });

  test('popup shows the current field value', async ({ page }) => {
    await openFieldPopup(page, 'hero-title');
    await expect(page.locator('#adm-popup-input')).toHaveValue('*Handcrafted* goods for your home');
  });

  test('popup shows hint text for markdown fields', async ({ page }) => {
    await openFieldPopup(page, 'hero-title');
    await expect(page.locator('#adm-popup-hint')).toContainText('Markdown');
  });

  test('single-line field uses input, multiline uses textarea', async ({ page }) => {
    // label-about is type:input — appears multiple times in nav; use first
    const iframeLocator = page.frameLocator('#adm-frame');
    await iframeLocator.locator('.qc-pencil[data-qc-key="label-about"]').first().click();
    await expect(page.locator('#adm-popup')).toBeVisible();
    await expect(page.locator('#adm-popup input#adm-popup-input')).toBeVisible();

    await page.locator('#adm-popup-cancel').click();
    await expect(page.locator('#adm-popup')).not.toBeVisible();

    // hero-title is type:textarea
    await openFieldPopup(page, 'hero-title');
    await expect(page.locator('#adm-popup textarea#adm-popup-input')).toBeVisible();
  });

  test('input is focused when popup opens', async ({ page }) => {
    // label-about appears multiple times; use first
    const iframeLocator = page.frameLocator('#adm-frame');
    await iframeLocator.locator('.qc-pencil[data-qc-key="label-about"]').first().click();
    await expect(page.locator('#adm-popup')).toBeVisible();
    // Small delay for the setTimeout(focus, 60)
    await page.waitForTimeout(150);
    await expect(page.locator('#adm-popup-input')).toBeFocused();
  });
});

test.describe('Live preview', () => {
  test.beforeEach(async ({ page }) => {
    await mockGitHubAPI(page);
    await page.goto('/admin/');
    await connectWithToken(page);
    await waitForIframe(page);
  });

  test('typing updates the iframe span in real time', async ({ page }) => {
    const iframeLocator = page.frameLocator('#adm-frame');
    await openFieldPopup(page, 'hero-title');

    await page.locator('#adm-popup-input').fill('Live Preview Test');

    await expect(
      iframeLocator.locator('span.qc-text[data-qc-key="hero-title"]')
    ).toContainText('Live Preview Test');
  });

  test('markdown is rendered in the live preview', async ({ page }) => {
    const iframeLocator = page.frameLocator('#adm-frame');
    await openFieldPopup(page, 'hero-title');

    await page.locator('#adm-popup-input').fill('**Bold** and *italic*');

    const span = iframeLocator.locator('span.qc-text[data-qc-key="hero-title"]');
    await expect(span.locator('strong')).toContainText('Bold');
    await expect(span.locator('em')).toContainText('italic');
  });

  test('cancel reverts the live preview to previous value', async ({ page }) => {
    const iframeLocator = page.frameLocator('#adm-frame');
    await openFieldPopup(page, 'hero-title');

    await page.locator('#adm-popup-input').fill('Temporary text');
    await expect(iframeLocator.locator('span.qc-text[data-qc-key="hero-title"]')).toContainText('Temporary text');

    await page.locator('#adm-popup-cancel').click();

    await expect(iframeLocator.locator('span.qc-text[data-qc-key="hero-title"]')).toContainText('Handcrafted');
  });

  test('Escape key reverts the live preview', async ({ page }) => {
    const iframeLocator = page.frameLocator('#adm-frame');
    await openFieldPopup(page, 'hero-sub');

    await page.locator('#adm-popup-input').fill('Cancelled value');
    await page.keyboard.press('Escape');

    await expect(page.locator('#adm-popup')).not.toBeVisible();
    await expect(iframeLocator.locator('span.qc-text[data-qc-key="hero-sub"]')).toContainText('Made with love');
  });
});

test.describe('Draft state', () => {
  test.beforeEach(async ({ page }) => {
    await mockGitHubAPI(page);
    await page.goto('/admin/');
    await connectWithToken(page);
    await waitForIframe(page);
  });

  test('Done saves to draft and shows dirty indicator', async ({ page }) => {
    await openFieldPopup(page, 'hero-title');
    await page.locator('#adm-popup-input').fill('Saved headline');
    await page.locator('#adm-popup-confirm').click();

    await expect(page.locator('#adm-popup')).not.toBeVisible();
    await expect(page.locator('#adm-dirty-msg')).toBeVisible();
    await expect(page.locator('#adm-publish')).toBeEnabled();
  });

  test('pencil gets is-dirty class after Done', async ({ page }) => {
    const iframeLocator = page.frameLocator('#adm-frame');
    await openFieldPopup(page, 'hero-title');
    await page.locator('#adm-popup-input').fill('Dirty headline');
    await page.locator('#adm-popup-confirm').click();

    await expect(iframeLocator.locator('.qc-pencil[data-qc-key="hero-title"]')).toHaveClass(/is-dirty/);
  });

  test('Enter key on single-line input confirms popup', async ({ page }) => {
    await openFieldPopup(page, 'about-sign');
    await page.locator('#adm-popup-input').fill('Q. Howard');
    await page.keyboard.press('Enter');

    await expect(page.locator('#adm-popup')).not.toBeVisible();
    await expect(page.locator('#adm-dirty-msg')).toBeVisible();
  });

  test('cancel does not mark dirty indicator', async ({ page }) => {
    await openFieldPopup(page, 'hero-title');
    await page.locator('#adm-popup-input').fill('Cancelled change');
    await page.locator('#adm-popup-cancel').click();

    await expect(page.locator('#adm-dirty-msg')).not.toBeVisible();
    await expect(page.locator('#adm-publish')).toBeDisabled();
  });

  test('switching to another pencil auto-confirms the open popup', async ({ page }) => {
    await openFieldPopup(page, 'hero-title');
    await page.locator('#adm-popup-input').fill('Auto-confirmed');

    const iframeLocator = page.frameLocator('#adm-frame');
    await iframeLocator.locator('.qc-pencil[data-qc-key="hero-sub"]').click();

    await expect(page.locator('#adm-popup-label')).toContainText('Hero subheading');
    await expect(page.locator('#adm-dirty-msg')).toBeVisible();
  });

  test('clicking frame overlay cancels popup', async ({ page }) => {
    await openFieldPopup(page, 'hero-title');
    await page.locator('#adm-popup-input').fill('Overlay cancel');
    // Click the bottom-left corner of the overlay (away from the floating popup)
    await page.locator('#adm-frame-overlay').click({ position: { x: 20, y: 600 }, force: true });

    await expect(page.locator('#adm-popup')).not.toBeVisible();
    await expect(page.locator('#adm-dirty-msg')).not.toBeVisible();
  });
});

test.describe('Card popup', () => {
  test.beforeEach(async ({ page }) => {
    await mockGitHubAPI(page);
    await page.goto('/admin/');
    await connectWithToken(page);
    await waitForIframe(page);
  });

  test('card popup shows all four fields with parsed values', async ({ page }) => {
    await openFieldPopup(page, 'card1');

    await expect(page.locator('[data-card-part="name"]')).toHaveValue('Linen Tea Towel');
    await expect(page.locator('[data-card-part="price"]')).toHaveValue('$28');
    await expect(page.locator('[data-card-part="tag"]')).toHaveValue('Bestseller');
    await expect(page.locator('[data-card-part="desc"]')).toHaveValue('Heavyweight 100% linen');
  });

  test('editing card fields updates live preview', async ({ page }) => {
    const iframeLocator = page.frameLocator('#adm-frame');
    await openFieldPopup(page, 'card1');

    await page.locator('[data-card-part="name"]').fill('Cotton Napkin');

    await expect(
      iframeLocator.locator('[data-card-key="card1"] .pcard-name')
    ).toContainText('Cotton Napkin');
  });
});

test.describe('Publish flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockGitHubAPI(page);
    await page.goto('/admin/');
    await connectWithToken(page);
    await waitForIframe(page);
  });

  test('Publish button is disabled before any edits', async ({ page }) => {
    await expect(page.locator('#adm-publish')).toBeDisabled();
  });

  test('publish sends PUT then workflow dispatch', async ({ page }) => {
    const apiCalls = [];
    page.on('request', req => {
      if (req.url().includes('api.github.com')) {
        apiCalls.push({ method: req.method(), url: req.url() });
      }
    });

    await openFieldPopup(page, 'hero-title');
    await page.locator('#adm-popup-input').fill('Published headline');
    await page.locator('#adm-popup-confirm').click();
    await page.locator('#adm-publish').click();

    await expect(page.locator('#adm-status')).toContainText('Published', { timeout: 8000 });

    const putCall      = apiCalls.find(r => r.method === 'PUT'  && r.url.includes('/contents/'));
    const dispatchCall = apiCalls.find(r => r.method === 'POST' && r.url.includes('/dispatches'));
    expect(putCall).toBeTruthy();
    expect(dispatchCall).toBeTruthy();
  });

  test('publish clears dirty state', async ({ page }) => {
    await openFieldPopup(page, 'hero-title');
    await page.locator('#adm-popup-input').fill('After publish');
    await page.locator('#adm-popup-confirm').click();
    await page.locator('#adm-publish').click();

    await expect(page.locator('#adm-status')).toContainText('Published', { timeout: 8000 });
    await expect(page.locator('#adm-dirty-msg')).not.toBeVisible();
    await expect(page.locator('#adm-publish')).toBeDisabled();
  });

  test('open popup is auto-confirmed before publishing', async ({ page }) => {
    const iframeLocator = page.frameLocator('#adm-frame');
    await openFieldPopup(page, 'hero-title');
    await page.locator('#adm-popup-input').fill('Implicit confirm on publish');

    await page.locator('#adm-publish').click();

    await expect(page.locator('#adm-status')).toContainText('Published', { timeout: 8000 });
    await expect(iframeLocator.locator('span.qc-text[data-qc-key="hero-title"]')).toContainText('Implicit confirm on publish');
  });
});
