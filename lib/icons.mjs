// Small line icons for source types. They inherit the text colour and size (1em).
const svg = body => `<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const kindIcon = {
  // A screen with a play symbol: reads as "video", not as a clickable arrow.
  Video: svg('<rect x="1.5" y="3" width="13" height="10" rx="2"/><path d="M6.5 6v4l3.5-2z" fill="currentColor" stroke="none"/>'),
  // A page with text lines.
  Blog: svg('<path d="M4 1.5h5.5L12.5 4.5v10h-8.5z"/><path d="M9.5 1.5v3h3M6 8h4.5M6 10.5h4.5"/>'),
  // An open book.
  Book: svg('<path d="M8 4c-1.5-1.2-3.5-1.5-6-1.2v9.7c2.5-.3 4.5 0 6 1.2 1.5-1.2 3.5-1.5 6-1.2V2.8C11.5 2.5 9.5 2.8 8 4zM8 4v9.7"/>'),
  // A speech bubble.
  Reddit: svg('<path d="M2 3.5h12v7.5H7l-3 2.5V11H2z"/>'),
};
export const linkIcon = svg('<path d="M6.5 3.5H3v9.5h9.5V9.5M9 2.5h4.5V7M13.5 2.5 7.5 8.5"/>');
