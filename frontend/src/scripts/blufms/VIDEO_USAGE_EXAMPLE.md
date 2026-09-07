# Using Videos in Demo Workflows

## Directory Structure

Place your MP4 files in: `frontend/public/demo-videos/`

Example:
```
frontend/
  public/
    demo-videos/
      security-forced-entry.mp4
      pest-inspection.mp4
      occupancy-overview.mp4
```

## Adding Video to a Status Card

### Option 1: Add videoUrl when creating the card

```typescript
{
  type: 'addStatusCard',
  card: {
    id: 'security-event-detail',
    type: 'security',
    title: 'Security Event Details',
    primaryValue: 'Forced Entry Detected',
    secondaryValue: 'Unit 402 - Zone C',
    videoUrl: '/demo-videos/security-forced-entry.mp4', // Add this
    hasSignificantDetails: true,
    // ... other properties
  },
}
```

### Option 2: Add videoUrl via updateCard action

```typescript
{
  type: 'updateCard',
  cardId: 'security-event-detail',
  updates: {
    videoUrl: '/demo-videos/security-forced-entry.mp4', // Add this
    // ... other updates
  },
}
```

## Path Format

- **Always use absolute paths** starting with `/`
- Path format: `/demo-videos/your-video-file.mp4`
- The path is relative to the `public` directory root

## Example: Security Workflow

```typescript
{
  type: 'updateCard',
  cardId: 'security-event-detail',
  updates: {
    isLoading: false,
    primaryValue: 'Forced Entry Detected',
    secondaryValue: 'Unit 402 - Zone C',
    videoUrl: '/demo-videos/security-forced-entry.mp4', // Video will appear in card
    showDetails: true,
    // ... rest of updates
  },
}
```

## Video Player Features

The video player automatically provides:
- Play/Pause controls
- Scrub bar for seeking
- Time display (current/total)
- Click-to-play when paused
- Hover controls overlay

## Notes

- Videos are served as static assets (not processed by Vite)
- Videos will be included in production builds
- Keep file sizes reasonable for web delivery
- Consider compressing videos if they're very large


