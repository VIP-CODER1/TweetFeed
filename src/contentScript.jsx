import { injectButton } from './injectButton.jsx';

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
  
  // Strategy 1: Find the article within the reply dialog/modal
  const dialog = replyBox.closest('[role="dialog"]');
  if (dialog) {
    console.log('[Tweet Helper] Found dialog');
    const articleInDialog = dialog.querySelector('article');
    if (articleInDialog) {
      // Try to get all tweetText elements within this article
      const allTweetTexts = articleInDialog.querySelectorAll('[data-testid="tweetText"]');
      console.log('[Tweet Helper] Found tweetText elements in dialog:', allTweetTexts.length);
      
      // Combine all text from all tweetText elements
      let combinedText = '';
      allTweetTexts.forEach((element, index) => {
        const text = element.innerText.trim();
        console.log('[Tweet Helper] Dialog tweetText', index, ':', text);
        if (text) {
          combinedText += (combinedText ? '\n' : '') + text;
        }
      });
      
      if (combinedText) {
        console.log('[Tweet Helper] Combined dialog text:', combinedText);
        return combinedText;
      }
      
      // Fallback: get text from the whole article
      const articleText = articleInDialog.innerText.trim();
      if (articleText) {
        // Remove "Replying to @username" and other metadata
        const lines = articleText.split('\n').filter(line => 
          !line.startsWith('Replying to') && 
          !line.startsWith('@') &&
          line.trim().length > 0
        );
        const cleanedText = lines.join('\n');
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
      
      const tweetText = findOriginalTweetText(replyBox);
      if (tweetText) {
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
          alert(tweetText);
          
          // After alert is dismissed, insert text into the already-active field
          setTimeout(() => {
            // Re-focus in case alert removed focus
            editableDiv.focus();
            
            // Clear any existing content first
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(editableDiv);
            selection.removeAllRanges();
            selection.addRange(range);
            
            // Try execCommand first
            let success = document.execCommand('insertText', false, tweetText);
            console.log('[Tweet Helper] execCommand success:', success);
            
            if (!success) {
              // Fallback: more robust text insertion for Twitter
              console.log('[Tweet Helper] execCommand failed, using fallback');
              
              // Clear the div
              editableDiv.innerHTML = '';
              
              // Create a text node with the content
              const textNode = document.createTextNode(tweetText);
              editableDiv.appendChild(textNode);
              
              // Set cursor to end
              range.selectNodeContents(editableDiv);
              range.collapse(false);
              selection.removeAllRanges();
              selection.addRange(range);
              
              // Trigger multiple input events to ensure Twitter recognizes the change
              editableDiv.dispatchEvent(new Event('input', { bubbles: true }));
              editableDiv.dispatchEvent(new Event('change', { bubbles: true }));
              editableDiv.dispatchEvent(new InputEvent('beforeinput', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: tweetText
              }));
              editableDiv.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: tweetText
              }));
              
              // Force Twitter to recognize the content
              const inputEvent = new Event('input', { bubbles: true });
              editableDiv.dispatchEvent(inputEvent);
            }
            
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
