import React from "react";

// This component renders the custom button for the Tweet reply field.
// Props:
//   onClick: function to call when the button is clicked
const TweetReplyButton = ({ onClick }) => {
  return (
    // The button uses a simple style and an emoji as an icon (replace as needed)
    <button
      style={{
        background: "#1da1f2",
        border: "none",
        borderRadius: "50%",
        width: 36,
        height: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        marginLeft: 8,
        position: "relative",
        zIndex: 10,
        flexShrink: 0
      }}
      title="Fetch Original Tweet"
      onClick={onClick}
    >
      {/* Use an emoji as a placeholder icon. Replace with an SVG or image if desired. */}
      <span role="img" aria-label="fetch" style={{ fontSize: "18px" }}>🔄</span>
    </button>
  );
};

export default TweetReplyButton;
