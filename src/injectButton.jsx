import React from "react";
import ReactDOM from "react-dom";
import TweetReplyButton from "./TweetReplyButton";

// This function injects the React button into a given reply field element.

export function injectButton(replyBox, onButtonClick) {
  // Check if container already exists for this reply box
  let parent = replyBox.parentNode;
  for (let i = 0; i < 10 && parent; i++) {
    if (parent.querySelector && parent.querySelector('.tweet-reply-helper-btn-container')) {
      console.log('[Tweet Helper] Container already exists, skipping');
      return;
    }
    parent = parent.parentNode;
  }
  
  // Create a container for the React button
  const container = document.createElement("div");
  container.className = "tweet-reply-helper-btn-container";
  container.style.cssText = "display: inline-block; margin-left: 4px; margin-right: 4px;";
  
  // Strategy: Insert the button right next to the reply box
  // Find the parent container that holds the reply box
  let insertionPoint = replyBox.parentElement;
  
  // Try to find the toolbar first
  let toolbar = null;
  let searchNode = replyBox;
  for (let i = 0; i < 15 && searchNode; i++) {
    searchNode = searchNode.parentElement;
    if (searchNode) {
      const foundToolbar = searchNode.querySelector('[data-testid="toolBar"]');
      if (foundToolbar) {
        // Make sure toolbar is close to the replyBox
        const boxRect = replyBox.getBoundingClientRect();
        const toolbarRect = foundToolbar.getBoundingClientRect();
        const distance = Math.abs(toolbarRect.top - boxRect.bottom);
        
        if (distance < 200) {
          toolbar = foundToolbar;
          console.log('[Tweet Helper] Found toolbar, distance:', distance);
          break;
        }
      }
    }
  }
  
  if (toolbar) {
    // Insert as first child of toolbar
    toolbar.insertBefore(container, toolbar.firstChild);
    console.log('[Tweet Helper] Button injected into toolbar');
  } else {
    // Fallback: insert after the replyBox
    console.log('[Tweet Helper] Toolbar not found, using fallback');
    if (replyBox.nextSibling) {
      replyBox.parentNode.insertBefore(container, replyBox.nextSibling);
    } else {
      replyBox.parentNode.appendChild(container);
    }
  }
  
  // Render the React button into the container
  ReactDOM.render(<TweetReplyButton onClick={onButtonClick} />, container);
}
