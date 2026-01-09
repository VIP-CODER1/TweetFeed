import { injectButton } from './injectButton.jsx';

// Shared regex for pic URLs
const PIC_URL_REGEX = /(?:https?:\/\/)?(?:pic\.x\.com|pic\.twitter\.com)\/[^\s]+/i;
const PIC_URL_REGEX_GLOBAL = /(?:https?:\/\/)?(?:pic\.x\.com|pic\.twitter\.com)\/[^\s]+/gi;

// Helper function to find all reply fields on the page
function findReplyFields() {
  // Try multiple selectors to find reply boxes
  const selectors = [
    '[data-testid="tweetTextarea_0"]',
    '[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"][data-testid^="tweetTextarea"]'
  ];
  
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      // Filter to only include reply boxes (not main compose box)
      const replyBoxes = Array.from(elements).filter(el => {
        // Check if this is a reply by looking for "Replying to" text or reply indicators
        let parent = el;
        for (let i = 0; i < 15 && parent; i++) {
          parent = parent.parentNode;
          if (parent) {
            const text = parent.textContent || '';
            // Look for "Replying to" or check for reply dialog indicators
            if (text.includes('Replying to') || 
                parent.querySelector('[data-testid="replyingToUsername"]') ||
                (parent.getAttribute && parent.getAttribute('aria-labelledby') === 'modal-header')) {
              return true;
            }
          }
        }
        
        // Additional check: if it's inside a modal/dialog (reply boxes are usually in modals)
        const closestDialog = el.closest('[role="dialog"]');
        const closestGroup = el.closest('[role="group"]');
        
        // If in a dialog or has a close button nearby, it's likely a reply
        if (closestDialog || (closestGroup && closestGroup.querySelector('[aria-label="Close"]'))) {
          return true;
        }
        
        return false;
      });
      
      if (replyBoxes.length > 0) {
        return replyBoxes;
      }
    }
  }
  return [];
}

function findOriginalTweetText(replyBox) {
  console.log('[Tweet Helper] Finding original tweet text...');

  const getAuthorDisplayName = (articleEl) => {
    try {
      const nameContainer = articleEl.querySelector('[data-testid="User-Name"]');
      if (!nameContainer) return null;
      const raw = (nameContainer.innerText || '').trim();
      if (!raw) return null;
      const normalize = (s) => (s || '')
        .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
      return {
        raw,
        normalized: normalize(raw)
      };
    } catch (e) {
      return null;
    }
  };

  const getFirstMeaningfulLine = (text) => {
    const lines = (text || '').split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.startsWith('Replying to')) continue;
      if (line.startsWith('@')) continue;
      if (/^(\d+\s*)?(Replies|Reposts|Reposts\s*&\s*quotes|Quotes|Retweets|Likes|Bookmarks|Views)$/i.test(line)) continue;
      if (/^Translate( post)?$/i.test(line)) continue;
      if (/^Show( more| this thread)?$/i.test(line)) continue;
      return line;
    }
    return null;
  };
  
  // Strategy 1: Find the article within the reply dialog/modal
  const dialog = replyBox.closest('[role="dialog"]');
  if (dialog) {
    console.log('[Tweet Helper] Found dialog');
    const articleInDialog = dialog.querySelector('article');
    if (articleInDialog) {
      const authorInfo = getAuthorDisplayName(articleInDialog);
      const isAuthorLine = (text) => {
        if (!authorInfo) return false;
        const normalize = (s) => (s || '')
          .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
          .replace(/\s+/g, ' ')
          .trim();
        const t = normalize(text);
        return t && (t === authorInfo.normalized || t === normalize(authorInfo.raw));
      };
      // Try to get tweet text within this article. On X, some text may live in
      // [data-testid="tweetText"] while other parts (like a headline line) can
      // appear in div[lang]. Collect both and dedupe while preserving order.
      const candidateTextNodes = articleInDialog.querySelectorAll('[data-testid="tweetText"], *[lang]');
      console.log('[Tweet Helper] Found candidate text nodes in dialog:', candidateTextNodes.length);

      const seen = new Set();
      const parts = [];

      candidateTextNodes.forEach((element, index) => {
        // Avoid any contenteditable/editor nodes if they appear inside the article.
        if (element.closest('[contenteditable="true"]')) return;

        const text = (element.innerText || '')
          .replace(/\u00a0/g, ' ')
          .trim();

        console.log('[Tweet Helper] Dialog text node', index, ':', text);
        if (!text) return;
        if (isAuthorLine(text)) return;
        if (seen.has(text)) return;
        seen.add(text);
        parts.push(text);
      });

      let combinedText = parts.join('\n').trim();

      // Remove author display name if it is leading
      if (authorInfo && combinedText) {
        const lines = combinedText.split('\n');
        const kept = lines.filter((line, idx) => {
          if (idx === 0 && isAuthorLine(line)) return false;
          return !isAuthorLine(line);
        });
        combinedText = kept.join('\n').trim();
      }

      // If we missed a leading headline line (common for some tweet layouts),
      // prepend the first meaningful line from the article's full text.
      const articleText = (articleInDialog.innerText || '').trim();
      const firstLine = getFirstMeaningfulLine(articleText);
      if (firstLine && combinedText && !combinedText.startsWith(firstLine) && !combinedText.includes(firstLine)) {
        combinedText = `${firstLine}\n${combinedText}`.trim();
      }

      if (combinedText) {
        console.log('[Tweet Helper] Combined dialog text:', combinedText);
        return combinedText;
      }
      
      // Fallback: get text from the whole article
      if (articleText) {
        // Remove "Replying to @username" and other metadata
        const lines = articleText.split('\n').filter(line => 
          !line.startsWith('Replying to') && 
          !line.startsWith('@') &&
          line.trim().length > 0
        );
        const cleanedText = lines
          .filter(l => !(authorInfo && isAuthorLine(l)))
          .join('\n');
        console.log('[Tweet Helper] Cleaned article text:', cleanedText);
        if (cleanedText) {
          return cleanedText;
        }
      }
    }
  }
  
  // Strategy 2: Get the first article on the page
  const firstArticle = document.querySelector('article');
  if (firstArticle) {
    const allTweetTexts = firstArticle.querySelectorAll('[data-testid="tweetText"]');
    console.log('[Tweet Helper] Found tweetText elements in first article:', allTweetTexts.length);
    
    let combinedText = '';
    allTweetTexts.forEach((element, index) => {
      const text = element.innerText.trim();
      console.log('[Tweet Helper] Article tweetText', index, ':', text);
      if (text && text.length > 5) {
        combinedText += (combinedText ? '\n' : '') + text;
      }
    });
    
    if (combinedText) {
      return combinedText;
    }
  }
  
  console.log('[Tweet Helper] No tweet text found');
  return null;
}

function normalizeExtractedTweetText(rawText) {
  if (!rawText) return rawText;

  const canonicalizePicUrl = (url) => {
    let normalized = url.trim();
    normalized = normalized.replace(/[)\].,!?]+$/g, '');
    // Match the common display in X (no scheme). This also tends to avoid
    // the composer creating a separate link preview row above the text.
    normalized = normalized.replace(/^https?:\/\//i, '');
    return normalized;
  };

  // Normalize line endings (keep newlines; they matter for formatting)
  const originalLines = rawText.replace(/\r\n/g, '\n').split('\n');

  // Merge split URL lines: "https://" + "pic.x.com/..." => "pic.x.com/..."
  const mergedLines = [];
  for (let i = 0; i < originalLines.length; i++) {
    const current = (originalLines[i] ?? '').trim();
    const next = (originalLines[i + 1] ?? '').trim();

    if (current.toLowerCase() === 'https://' && /^(pic\.x\.com|pic\.twitter\.com)\//i.test(next)) {
      mergedLines.push(next);
      i++;
      continue;
    }

    mergedLines.push(current);
  }

  // Collect pic links and remove them from the text body
  const picLinks = new Set();
  const bodyLines = [];
  let pendingBlank = false;

  for (const line of mergedLines) {
    const trimmed = (line ?? '').trim();

    if (!trimmed) {
      pendingBlank = bodyLines.length > 0;
      continue;
    }

    // Extract ALL pic links from the line
    const matches = trimmed.match(PIC_URL_REGEX_GLOBAL) || [];
    for (const m of matches) picLinks.add(canonicalizePicUrl(m));

    // Remove pic links from the line content
    const withoutLinks = trimmed
      .replace(PIC_URL_REGEX_GLOBAL, '')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();

    if (!withoutLinks) {
      continue;
    }

    if (pendingBlank) {
      bodyLines.push('');
      pendingBlank = false;
    }
    bodyLines.push(withoutLinks);
  }

  // Choose one pic link (deduped) and append it as the final line
  const picUrl = picLinks.values().next().value || null;
  if (picUrl) {
    // Ensure the body doesn't already contain any pic links (extra safety)
    const sanitizedBody = bodyLines.map((l) => l.replace(PIC_URL_REGEX_GLOBAL, '').trim());
    while (sanitizedBody.length > 0 && sanitizedBody[sanitizedBody.length - 1] === '') sanitizedBody.pop();
    sanitizedBody.push(picUrl);
    return sanitizedBody.join('\n').trim();
  }

  return bodyLines.join('\n').trim();
}

function injectButtonsToAllReplyFields() {
  const replyFields = findReplyFields();
  console.log('[Tweet Helper] Found reply fields:', replyFields.length);
  
  replyFields.forEach(replyBox => {
    // Check if THIS specific reply box already has a button
    if (replyBox.hasAttribute('data-helper-button-added')) {
      console.log('[Tweet Helper] Button already added to this reply box');
      return;
    }
    
    // Also check if there's already a button container nearby
    const parent = replyBox.parentNode;
    if (parent && parent.querySelector('.tweet-reply-helper-btn-container')) {
      console.log('[Tweet Helper] Button container already exists');
      replyBox.setAttribute('data-helper-button-added', 'true');
      return;
    }
    
    // Mark this reply box as having a button
    replyBox.setAttribute('data-helper-button-added', 'true');
    console.log('[Tweet Helper] Injecting button into reply box');
    
    // Flag to prevent multiple simultaneous executions
    let isProcessing = false;
    
    injectButton(replyBox, function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      // Prevent multiple clicks
      if (isProcessing) {
        console.log('[Tweet Helper] Already processing, ignoring click');
        return;
      }
      
      isProcessing = true;
      console.log('[Tweet Helper] Button clicked');
      
      const rawTweetText = findOriginalTweetText(replyBox);
      const tweetText = normalizeExtractedTweetText(rawTweetText);
      if (tweetText) {
        // Split out pic link (if present) so we can append it after body text
        const lines = tweetText.split('\n');
        let picLine = null;
        for (let i = lines.length - 1; i >= 0; i--) {
          if (PIC_URL_REGEX.test(lines[i].trim())) {
            picLine = lines[i].trim();
            lines.splice(i, 1);
            break;
          }
        }
        const bodyText = lines.join('\n').trim();

        // Find and activate the field BEFORE showing alert
        let editableDiv = replyBox.contentEditable === 'true' ? replyBox : replyBox.querySelector('[contenteditable="true"]');
        
        // If still not found, search more broadly
        if (!editableDiv) {
          console.log('[Tweet Helper] Searching for contenteditable more broadly');
          let parent = replyBox.parentElement;
          for (let i = 0; i < 5 && parent && !editableDiv; i++) {
            editableDiv = parent.querySelector('[contenteditable="true"]');
            parent = parent.parentElement;
          }
        }
        
        console.log('[Tweet Helper] Editable div found:', !!editableDiv);
        
        if (editableDiv) {
          // IMPORTANT: Activate the field BEFORE showing the alert
          editableDiv.click();
          editableDiv.focus();
          editableDiv.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
          editableDiv.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
          
          // Now show alert (field is already active)
          alert(bodyText + (picLine ? `\n${picLine}` : ''));
          
          // After alert is dismissed, insert text into the already-active field
          setTimeout(() => {
            // Re-focus in case alert removed focus
            editableDiv.focus();
            
            // Gentler insertion: try execCommand first without clearing; fallback to manual
            const selection = window.getSelection();
            const range = document.createRange();
            const combinedText = [bodyText, picLine].filter(Boolean).join('\n');

            // Place caret at end
            range.selectNodeContents(editableDiv);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);

            let insertedWithExec = document.execCommand('insertText', false, combinedText);
            console.log('[Tweet Helper] execCommand insertText combined success:', insertedWithExec);

            if (!insertedWithExec) {
              // Fallback: clear then insert text nodes in order
              editableDiv.innerHTML = '';
              if (combinedText) {
                editableDiv.appendChild(document.createTextNode(combinedText));
              }
              // Reset caret to end
              range.selectNodeContents(editableDiv);
              range.collapse(false);
              selection.removeAllRanges();
              selection.addRange(range);
            }

            // Fire paste-like events so Reply enables
            editableDiv.dispatchEvent(new InputEvent('beforeinput', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertFromPaste',
              data: combinedText
            }));
            editableDiv.dispatchEvent(new InputEvent('input', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertFromPaste',
              data: combinedText
            }));
            editableDiv.dispatchEvent(new Event('input', { bubbles: true }));
            
            // Keep focus and ensure content is visible
            editableDiv.focus();
            editableDiv.scrollTop = editableDiv.scrollHeight;
            
            // Reset processing flag
            isProcessing = false;
            console.log('[Tweet Helper] Processing flag reset');
          }, 100);
        } else {
          alert('Could not find the text input field.');
          isProcessing = false;
        }
      } else {
        alert('Could not find original Tweet text.');
        isProcessing = false;
      }
    });
  });
}

const observer = new MutationObserver(() => {
  injectButtonsToAllReplyFields();
});
observer.observe(document.body, { childList: true, subtree: true });

injectButtonsToAllReplyFields();
