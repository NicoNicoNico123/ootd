# OOTD Gen - AI Outfit Generator

A React web application for generating AI-powered outfit images using the RunningHub AI API.

## Features

- 📸 Upload photos for outfit generation
- 🎨 Customizable aspect ratios and resolutions
- ⚡ Fast and responsive UI built with React and Tailwind CSS
- 📥 Download generated images
- 🔗 Share functionality

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to the URL shown in the terminal (typically `http://localhost:5173`)

### Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
ootd/
├── src/
│   ├── App.jsx          # Main application component
│   ├── main.jsx         # React entry point
│   └── index.css        # Tailwind CSS imports
├── index.html           # HTML template
├── package.json         # Dependencies and scripts
├── vite.config.js       # Vite configuration
├── tailwind.config.js   # Tailwind CSS configuration
└── postcss.config.js    # PostCSS configuration
```

## API Configuration

The API configuration is located in `src/App.jsx`. Update the `API_CONFIG` object if you need to change the API endpoint or credentials.

## Technologies Used

- **React 18** - UI library
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **Lucide React** - Icons

## Notes

- The current implementation uses the filename as a placeholder for the file hash. In production, you'll need to implement a proper file upload endpoint to get the actual file hash before calling the generation API.
- The app includes fallback handling for API responses that may vary in structure.

