# Demo Videos

This directory contains MP4 video files used in the BluFMS demo workflows.

## Usage

Videos placed in this directory can be referenced in workflow scripts using absolute paths:

```typescript
{
  type: 'addStatusCard',
  card: {
    id: 'security-event',
    type: 'security',
    title: 'Security Event',
    videoUrl: '/demo-videos/security-event.mp4',
    // ... other card properties
  },
}
```

## File Organization

- Place all demo video files directly in this directory
- Use descriptive filenames (e.g., `security-forced-entry.mp4`, `pest-inspection.mp4`)
- Keep file sizes reasonable for demo purposes (consider compression if needed)

## Notes

- Videos are served as static assets and are not processed by Vite
- Use absolute paths starting with `/` to reference videos
- Videos will be available at runtime and included in production builds


