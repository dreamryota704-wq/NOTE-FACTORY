/**
 * NOTE FACTORY バックエンドサーバー v10
 * Puppeteer で note.com を自動操作し、下書き保存を行います。
 *
 * 起動方法:
 *   npm install
 *   node src/server.js
 *
 * エンドポイント:
 *   POST /api/test-auth  - note.com ログインテスト
 *   POST /api/draft-save - 下書き自動保存（タイトル・本文・タグ・価格・サムネ）
 */

const express  = require('express');
const puppeteer = require('puppeteer');
const cors     = require('cors');
const os       = require('os');
const path     = require('path');
const fs       = require('fs');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

// ─────────────────────────────────────────────
// ブラウザ管理
// ─────────────────────────────────────────────
let browser = null;

// Mac/Windows の Chrome パスを探す
function findChromePath() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null; // Puppeteer 同梱の Chromium を使う
}

async function launchBrowser() {
  if (browser && browser.isConnected()) return browser;
  console.log('🚀 ブラウザ起動中...');

  const chromePath = findChromePath();
  if (chromePath) {
    console.log('  Chrome 使用:', chromePath);
  } else {
    console.log('  Puppeteer 同梱 Chromium を使用');
  }

  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ],
    defaultViewport: { width: 1280, height: 900 },
  };
  if (chromePath) launchOptions.executablePath = chromePath;

  browser = await puppeteer.launch(launchOptions);
  browser.on('disconnected', () => {
    console.log('ブラウザが切断されました');
    browser = null;
  });
  return browser;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─────────────────────────────────────────────
// note.com ログイン（複数セレクター対応・2ステップ対応）
// ─────────────────────────────────────────────
async function loginToNote(page, email, password) {
  console.log(`  ログイン中: ${email}`);
  await page.goto('https://note.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000); // JS描画を待つ

  // デバッグ: ページ内のinputを全てログ出力
  const inputs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('input')).map(i => ({
      type: i.type, name: i.name, id: i.id,
      placeholder: i.placeholder, className: i.className.substring(0, 60)
    }))
  );
  console.log('  ページ内input一覧:', JSON.stringify(inputs));

  // メールアドレス inputを探す（複数パターン）
  const emailSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[id*="email"]',
    'input[autocomplete="email"]',
    'input[placeholder*="メール"]',
    'input[placeholder*="mail"]',
    'input[placeholder*="Mail"]',
  ];

  let emailInput = null;
  for (const sel of emailSelectors) {
    try {
      emailInput = await page.$(sel);
      if (emailInput) { console.log('  メール欄:', sel); break; }
    } catch {}
  }

  // 見つからない場合はtype=text のinputを全て試す
  if (!emailInput) {
    const allInputs = await page.$$('input[type="text"], input:not([type])');
    if (allInputs.length > 0) {
      emailInput = allInputs[0];
      console.log('  メール欄: フォールバック (最初のinput)');
    }
  }

  if (!emailInput) {
    // スクリーンショットを保存してデバッグ
    await page.screenshot({ path: '/tmp/note_login_debug.png' });
    throw new Error('メール入力欄が見つかりません。/tmp/note_login_debug.png を確認してください');
  }

  await emailInput.click({ clickCount: 3 });
  await emailInput.type(email, { delay: 50 });
  await sleep(500);

  // パスワード input
  const pwSelectors = [
    'input[type="password"]',
    'input[name="password"]',
    'input[id*="password"]',
    'input[placeholder*="パスワード"]',
  ];
  let pwInput = null;
  for (const sel of pwSelectors) {
    try {
      pwInput = await page.$(sel);
      if (pwInput) { console.log('  PW欄:', sel); break; }
    } catch {}
  }

  // note.com は2ステップログイン（email入力→次へ→password）の場合あり
  if (!pwInput) {
    console.log('  パスワード欄なし → 2ステップログインを試みます');
    // 「次へ」ボタンを押す
    const nextClicked = await clickButtonByText(page, '次へ') ||
                        await clickButtonByText(page, 'ログイン') ||
                        await tryClick(page, ['button[type="submit"]']);
    if (nextClicked) {
      await sleep(2500);
      for (const sel of pwSelectors) {
        try {
          pwInput = await page.$(sel);
          if (pwInput) { console.log('  PW欄 (2ステップ):', sel); break; }
        } catch {}
      }
    }
  }

  if (!pwInput) {
    await page.screenshot({ path: '/tmp/note_pw_debug.png' });
    throw new Error('パスワード入力欄が見つかりません。/tmp/note_pw_debug.png を確認してください');
  }

  await pwInput.click({ clickCount: 3 });
  await pwInput.type(password, { delay: 50 });
  await sleep(500);

  // ログインボタン押下
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
    page.keyboard.press('Enter'),
  ]);
  await sleep(2000);

  const url = page.url();
  console.log('  ログイン後URL:', url);
  if (url.includes('/login') || url.includes('/error')) {
    await page.screenshot({ path: '/tmp/note_loginfail_debug.png' });
    throw new Error('ログイン失敗: メールアドレスまたはパスワードを確認してください');
  }
  console.log('  ✅ ログイン成功');
  return true;
}

// ─────────────────────────────────────────────
// 要素クリック（複数セレクターを試す）
// ─────────────────────────────────────────────
async function tryClick(page, selectors) {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) { await el.click(); return true; }
    } catch {}
  }
  // テキストで探す
  return false;
}

// ─────────────────────────────────────────────
// テキストでボタンを探す
// ─────────────────────────────────────────────
async function clickButtonByText(page, text) {
  const buttons = await page.$$('button, a[role="button"]');
  for (const btn of buttons) {
    const t = await page.evaluate(el => el.textContent?.trim(), btn);
    if (t && t.includes(text)) {
      await btn.click();
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────
// エディタにテキストを挿入
// ─────────────────────────────────────────────
async function insertTextToEditor(page, text) {
  // ProseMirror / Tiptap エディタを探す
  const editorSelectors = [
    '.ProseMirror',
    '[contenteditable="true"].ProseMirror',
    '.note-editor [contenteditable="true"]',
    '[data-testid="editor-content"] [contenteditable="true"]',
    '[contenteditable="true"]:not([aria-label*="タイトル"]):not([data-placeholder*="タイトル"])',
  ];

  for (const sel of editorSelectors) {
    try {
      const editors = await page.$$(sel);
      if (editors.length === 0) continue;

      // タイトル以外のエディタを選択（最後の contenteditable が本文のことが多い）
      const editor = editors[editors.length - 1];
      await editor.click();
      await sleep(300);

      // execCommand でテキスト挿入（改行を維持）
      const success = await page.evaluate((bodyText) => {
        const lines = bodyText.split('\n');
        let ok = false;
        // 全選択クリア
        document.execCommand('selectAll', false, null);
        document.execCommand('delete', false, null);
        for (let i = 0; i < lines.length; i++) {
          if (lines[i]) {
            ok = document.execCommand('insertText', false, lines[i]) || ok;
          }
          if (i < lines.length - 1) {
            document.execCommand('insertParagraph', false, null);
          }
        }
        return ok;
      }, text);

      if (success) {
        console.log('  ✅ 本文挿入成功 (execCommand)');
        return true;
      }

      // フォールバック: keyboard.type（遅いが確実）
      await editor.click({ clickCount: 3 });
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await page.keyboard.down('Meta');
      await page.keyboard.press('a');
      await page.keyboard.up('Meta');
      // 最大 3000 字をタイプ（速度優先）
      const shortBody = text.substring(0, 3000);
      await page.keyboard.type(shortBody, { delay: 2 });
      console.log('  ⚠️  本文挿入 (keyboard.type, 先頭3000字)');
      return true;
    } catch (e) {
      console.warn(`  エディタ(${sel}) 挿入エラー:`, e.message);
    }
  }
  return false;
}

// ─────────────────────────────────────────────
// API: /api/test-auth  ログインテスト
// ─────────────────────────────────────────────
app.post('/api/test-auth', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: '認証情報が不足しています' });
  }

  let page;
  try {
    const br = await launchBrowser();
    page = await br.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });
    await loginToNote(page, email, password);
    res.json({ ok: true, message: '接続完了' });
  } catch (e) {
    console.error('test-auth エラー:', e.message);
    res.status(401).json({ error: e.message });
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

// ─────────────────────────────────────────────
// API: /api/draft-save  下書き保存
// ─────────────────────────────────────────────
app.post('/api/draft-save', async (req, res) => {
  const { email, password, title, body, tags = [], price = 0, coverImage } = req.body;

  if (!email || !password || !title || !body) {
    return res.status(400).json({ error: '必須パラメータ不足 (email/password/title/body)' });
  }

  console.log(`\n📝 下書き保存開始: 「${title.substring(0, 30)}」`);

  let page;
  let tmpImagePath = null;

  try {
    const br = await launchBrowser();
    page = await br.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'ja-JP,ja;q=0.9' });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // ── 1. ログイン ──────────────────────────────
    await loginToNote(page, email, password);

    // ── 2. 新規note作成ページへ ───────────────────
    console.log('  新規作成ページへ移動...');
    await page.goto('https://note.com/notes/new', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);

    // テキストnote選択モーダルが出た場合 → テキストを選択
    const textSelected = await clickButtonByText(page, 'テキスト');
    if (textSelected) {
      console.log('  テキストnoteを選択');
      await sleep(1500);
    }

    // ── 3. タイトル入力 ──────────────────────────
    console.log('  タイトル入力中...');
    const titleSelectors = [
      'textarea[placeholder*="タイトル"]',
      'input[placeholder*="タイトル"]',
      '[contenteditable][data-placeholder*="タイトル"]',
      '[aria-label*="タイトル"][contenteditable]',
      'h1[contenteditable]',
    ];
    let titleSet = false;
    for (const sel of titleSelectors) {
      try {
        const el = await page.$(sel);
        if (!el) continue;
        await el.click({ clickCount: 3 });
        // contenteditable の場合
        const tag = await page.evaluate(e => e.tagName.toLowerCase(), el);
        if (tag !== 'input' && tag !== 'textarea') {
          await page.evaluate((el, t) => {
            el.textContent = '';
            el.focus();
            document.execCommand('insertText', false, t);
          }, el, title);
        } else {
          await el.type(title, { delay: 20 });
        }
        titleSet = true;
        console.log('  ✅ タイトル設定:', title.substring(0, 20));
        break;
      } catch (e) {
        console.warn(`  タイトル(${sel}):`, e.message);
      }
    }
    if (!titleSet) console.warn('  ⚠️  タイトル設定スキップ');

    await sleep(500);

    // ── 4. 本文入力 ──────────────────────────────
    console.log('  本文入力中...');
    const bodyInserted = await insertTextToEditor(page, body);
    if (!bodyInserted) console.warn('  ⚠️  本文挿入失敗');

    await sleep(1000);

    // ── 5. カバー画像アップロード ─────────────────
    if (coverImage && coverImage.startsWith('data:image')) {
      console.log('  サムネイル画像アップロード中...');
      try {
        // base64 → 一時ファイル
        const base64Data = coverImage.replace(/^data:image\/\w+;base64,/, '');
        const imgBuf = Buffer.from(base64Data, 'base64');
        tmpImagePath = path.join(os.tmpdir(), `nf_thumb_${Date.now()}.png`);
        fs.writeFileSync(tmpImagePath, imgBuf);

        // カバー画像ボタンを探す（複数の方法）
        const coverBtnClicked = await clickButtonByText(page, 'カバー') ||
                                await clickButtonByText(page, 'サムネ') ||
                                await clickButtonByText(page, '画像') ||
                                await tryClick(page, [
                                  '[class*="cover"] button',
                                  '[class*="Cover"] button',
                                  '[class*="thumbnail"] button',
                                  'button[aria-label*="画像"]',
                                ]);

        if (coverBtnClicked) {
          await sleep(800);
        }

        // file input にファイルをセット
        const fileInputs = await page.$$('input[type="file"]');
        let uploaded = false;
        for (const fi of fileInputs) {
          try {
            const accept = await page.evaluate(el => el.accept, fi);
            if (!accept || accept.includes('image')) {
              await fi.uploadFile(tmpImagePath);
              await sleep(2500);
              uploaded = true;
              console.log('  ✅ サムネイルアップロード完了');
              break;
            }
          } catch {}
        }
        if (!uploaded) console.warn('  ⚠️  file input が見つかりません');
      } catch (imgErr) {
        console.warn('  ⚠️  サムネイルアップロード失敗:', imgErr.message);
      }
    }

    // ── 6. タグ入力 ──────────────────────────────
    if (tags && tags.length > 0) {
      console.log('  タグ入力中...');
      try {
        const tagInput = await page.$('input[placeholder*="タグ"]') ||
                         await page.$('input[placeholder*="tag"]') ||
                         await page.$('[class*="tag"] input');
        if (tagInput) {
          for (const tag of tags.slice(0, 5)) {
            await tagInput.click();
            await tagInput.type(tag, { delay: 30 });
            await page.keyboard.press('Enter');
            await sleep(300);
          }
          console.log('  ✅ タグ設定:', tags.slice(0, 5).join(', '));
        }
      } catch (tagErr) {
        console.warn('  ⚠️  タグ設定失敗:', tagErr.message);
      }
    }

    // ── 7. 有料設定 ──────────────────────────────
    if (price > 0) {
      console.log('  有料設定中: ¥' + price);
      try {
        const paidClicked = await clickButtonByText(page, '有料') ||
                            await tryClick(page, [
                              'button[data-note-type="paid"]',
                              '[class*="Price"] button',
                              'input[value="paid"]',
                            ]);
        if (paidClicked) {
          await sleep(500);
          const priceInput = await page.$('input[type="number"]') ||
                             await page.$('input[placeholder*="金額"]');
          if (priceInput) {
            await priceInput.click({ clickCount: 3 });
            await priceInput.type(String(price));
          }
        }
      } catch (priceErr) {
        console.warn('  ⚠️  有料設定失敗:', priceErr.message);
      }
    }

    // ── 8. 下書き保存ボタン ───────────────────────
    console.log('  下書き保存ボタンを押下...');
    await sleep(1000);

    let saved = await clickButtonByText(page, '下書き保存') ||
                await clickButtonByText(page, '下書き') ||
                await tryClick(page, [
                  'button[data-type="draft"]',
                  'button[class*="draft"]',
                  'button[class*="Draft"]',
                  '[aria-label*="下書き"]',
                ]);

    // フォールバック: 保存ボタンを探す
    if (!saved) {
      saved = await clickButtonByText(page, '保存');
    }

    await sleep(3000);

    const draftUrl = page.url();
    console.log('  ✅ 保存完了 URL:', draftUrl);

    res.json({ ok: true, draftUrl, saved });

  } catch (e) {
    console.error('draft-save エラー:', e.message);
    res.status(500).json({ error: e.message });
  } finally {
    // 一時ファイル削除
    if (tmpImagePath && fs.existsSync(tmpImagePath)) {
      try { fs.unlinkSync(tmpImagePath); } catch {}
    }
    if (page) await page.close().catch(() => {});
  }
});

// ─────────────────────────────────────────────
// ヘルスチェック
// ─────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, version: '10.0', time: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// 起動
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║   NOTE FACTORY バックエンドサーバー v10   ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║   http://localhost:${PORT}                  ║`);
  console.log('╠══════════════════════════════════════════╣');
  console.log('║   POST /api/test-auth   ログインテスト   ║');
  console.log('║   POST /api/draft-save  下書き自動保存   ║');
  console.log('║   GET  /api/health      ヘルスチェック   ║');
  console.log('╚══════════════════════════════════════════╝\n');
});
