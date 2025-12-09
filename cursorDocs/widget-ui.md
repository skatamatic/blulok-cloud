# BluLok Cloud Widget System UI Guide

## Overview

The BluLok Cloud widget system provides a flexible, drag-and-drop dashboard interface that adapts to user roles and preferences. Widgets are the primary building blocks for displaying data and functionality in the application.

## Widget Interaction Design

### Drag and Drop Behavior

**Drag Initiation:**
- **Drag Handle**: Only the widget header area is draggable
- **Visual Feedback**: Header shows drag handle (hamburger icon) on hover
- **Cursor Following**: Widget follows cursor exactly during drag (no snapping to grid during drag)
- **Smooth Movement**: 60fps smooth movement with proper transform handling

**Drag States:**
```css
/* Normal state */
.widget { 
  transform: none; 
  transition: all 0.2s ease; 
}

/* Dragging state */
.widget.dragging { 
  transform: scale(1.03); 
  opacity: 0.9; 
  z-index: 40;
  transition: none; /* No transitions during drag for smooth following */
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
}

/* Placeholder (drop target) */
.placeholder {
  background: rgba(20, 127, 212, 0.1);
  border: 2px dashed rgba(20, 127, 212, 0.4);
  animation: placeholderPulse 1.5s ease-in-out infinite;
}
```

**Drop Behavior:**
- **Snap to Grid**: Placeholder snaps to grid positions during drag
- **Collision Avoidance**: Other widgets smoothly move out of the way
- **Drop Animation**: Smooth settle animation when released
- **Layout Persistence**: Layout changes saved to user preferences

### Resize System

**Size Presets:**
```typescript
enum WidgetSize {
  TINY = 'tiny',     // 1x1 - Icon + single value
  SMALL = 'small',   // 2x1 - Icon + value + trend
  MEDIUM = 'medium', // 2x2 - Standard widget size
  LARGE = 'large',   // 3x2 - Extended content
  HUGE = 'huge'      // 4x3 - Maximum content
}
```

**Size Mapping:**
```typescript
const sizeMap = {
  tiny: { w: 1, h: 1 },
  small: { w: 2, h: 1 },
  medium: { w: 2, h: 2 },
  large: { w: 3, h: 2 },
  huge: { w: 4, h: 3 }
};
```

**Resize Interface:**
- **Hamburger Menu**: Click to show size options
- **Dropdown Menu**: Select from available sizes
- **Instant Resize**: Immediate layout adjustment
- **Content Adaptation**: Widget content adapts to new size

## Widget Types & Sizing

### Stats Widget

**Available Sizes:**
- **Tiny** (1x1): Icon + value only
- **Small** (2x1): Icon + value + trend
- **Medium** (2x2): Full stats with description

**Content Adaptation:**
```typescript
// Tiny size: Minimal content
if (size === 'tiny') {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <Icon className="h-6 w-6 mx-auto mb-1" />
        <div className="text-lg font-bold">{value}</div>
      </div>
    </div>
  );
}

// Small size: Horizontal layout
if (size === 'small') {
  return (
    <div className="flex items-center justify-between h-full">
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm text-gray-500">{change}</div>
      </div>
      <Icon className="h-8 w-8" />
    </div>
  );
}

// Medium size: Full layout
return <FullStatsLayout />;
```

### Activity Widget

**Available Sizes:**
- **Medium** (2x2): 3-4 activities
- **Large** (3x2): 6-8 activities  
- **Huge** (4x3): 10+ activities with search

**Content Adaptation:**
- **Medium**: Show 4 most recent activities
- **Large**: Show 8 activities with "View All" link
- **Huge**: Show 12+ activities with search/filter

### Status Widget

**Available Sizes:**
- **Small** (2x1): 2-3 status items, compact
- **Medium** (2x2): 4-6 status items, standard
- **Large** (3x2): 8+ status items with details

**Fixed Size Widgets:**
- **Chart Widgets**: Always large or huge (need space for visualization)
- **Map Widgets**: Always large or huge (geographic data needs space)
- **Table Widgets**: Always medium or larger (tabular data requirements)

### Facility Viewer Widget (`facility-viewer`)

**Available Sizes:**
- **Huge** (6x4): Full 3D facility visualization (default)
- **Huge-Wide** (8x4): Extended width for wider facilities

**Content:**
- Interactive 3D view of linked BluDesign facility
- Floor selector panel (collapsible, bottom-right)
- Object selection with properties panel
- Camera rotation controls (bottom center)
- Real-time smart asset state updates via WebSocket

**Visibility:**
- Only available for facilities with linked BluDesign 3D models
- `facility.bluDesignFacilityId` must exist for widget to appear in "Add Widget" modal

**Implementation:**
```tsx
<FacilityViewerWidget
  id={widget.id}
  title={widget.title}
  bluDesignFacilityId="uuid-of-3d-model"
  bluLokFacilityId="uuid-of-facility"
  facilityName="My Facility"
  initialSize="huge"
  onRemove={() => removeWidget(widget.id)}
/>
```

## Responsive Content Design

### Size-Based Layouts

**Tiny Widgets (1x1):**
```jsx
<div className="flex items-center justify-center h-full p-2">
  <div className="text-center">
    <Icon className="h-6 w-6 mx-auto text-primary-600" />
    <div className="text-lg font-bold text-gray-900 mt-1">{value}</div>
  </div>
</div>
```

**Small Widgets (2x1):**
```jsx
<div className="flex items-center justify-between h-full p-4">
  <div className="flex-1">
    <div className="text-2xl font-bold">{value}</div>
    <div className="text-sm text-gray-500">{subtitle}</div>
  </div>
  <Icon className="h-8 w-8 text-primary-600" />
</div>
```

**Medium Widgets (2x2):**
```jsx
<div className="h-full p-4 flex flex-col">
  <div className="flex items-center justify-between mb-4">
    <div className="text-3xl font-bold">{value}</div>
    <Icon className="h-10 w-10 text-primary-600" />
  </div>
  <div className="flex-1">
    {/* Additional content */}
  </div>
</div>
```

### Content Prioritization

**Information Hierarchy:**
1. **Primary Value**: Always visible (main metric/status)
2. **Secondary Info**: Visible in small+ sizes (trends, changes)
3. **Tertiary Details**: Visible in medium+ sizes (descriptions, metadata)
4. **Interactive Elements**: Visible in large+ sizes (buttons, links)

**Content Hiding Strategy:**
```typescript
const getVisibleContent = (size: WidgetSize) => {
  const content = {
    primary: true,
    secondary: size !== 'tiny',
    tertiary: ['medium', 'large', 'huge'].includes(size),
    interactive: ['large', 'huge'].includes(size),
    search: size === 'huge'
  };
  
  return content;
};
```

## Drag and Drop Implementation

### Technical Requirements

**Cursor Following:**
```typescript
// Disable react-grid-layout's transform during drag
const gridProps = {
  transformScale: 1,
  useCSSTransforms: true,
  // Custom drag behavior
  onDrag: (layout, oldItem, newItem, placeholder, e, element) => {
    // Update element position to follow cursor exactly
    const rect = element.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    
    element.style.transform = `translate(${e.clientX - offsetX}px, ${e.clientY - offsetY}px) scale(1.03)`;
  }
};
```

**Placeholder Animation:**
```css
.react-grid-placeholder {
  background: linear-gradient(45deg, 
    rgba(20, 127, 212, 0.1) 25%, 
    rgba(20, 127, 212, 0.05) 25%, 
    rgba(20, 127, 212, 0.05) 50%, 
    rgba(20, 127, 212, 0.1) 50%);
  background-size: 20px 20px;
  animation: placeholderMove 2s linear infinite, placeholderPulse 1.5s ease-in-out infinite;
}

@keyframes placeholderMove {
  0% { background-position: 0 0; }
  100% { background-position: 20px 20px; }
}

@keyframes placeholderPulse {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 0.4; }
}
```

### Collision Detection

**Smart Layout:**
- **Bubble Effect**: Widgets smoothly move out of the way
- **Shortest Path**: Widgets take the shortest route to new positions
- **Maintain Relationships**: Related widgets try to stay near each other
- **Boundary Respect**: Widgets never overlap or go outside boundaries

## Widget Header Design

### Header Components

**Standard Header:**
```jsx
<div className="widget-header drag-handle">
  <div className="flex items-center justify-between">
    <h3 className="widget-title">{title}</h3>
    <div className="widget-controls">
      <WidgetSizeMenu currentSize={size} availableSizes={availableSizes} />
      <WidgetOptionsMenu options={options} />
    </div>
  </div>
</div>
```

**Drag Handle Styling:**
```css
.drag-handle {
  cursor: grab;
  user-select: none;
  transition: background-color 0.2s ease;
}

.drag-handle:hover {
  background-color: rgba(0, 0, 0, 0.02);
}

.drag-handle:active,
.dragging .drag-handle {
  cursor: grabbing;
  background-color: rgba(0, 0, 0, 0.05);
}
```

### Size Menu Component

**Dropdown Interface:**
```jsx
<Dropdown>
  <DropdownTrigger>
    <button className="widget-hamburger">
      <EllipsisVerticalIcon className="h-5 w-5" />
    </button>
  </DropdownTrigger>
  
  <DropdownContent>
    {availableSizes.map(size => (
      <DropdownItem 
        key={size}
        onClick={() => onSizeChange(size)}
        selected={currentSize === size}
      >
        <SizeIcon size={size} />
        <span>{formatSizeName(size)}</span>
        <span className="text-xs text-gray-500">
          {getSizeDimensions(size)}
        </span>
      </DropdownItem>
    ))}
  </DropdownContent>
</Dropdown>
```

## Performance Considerations

### Animation Performance

**60fps Target:**
- Use `transform` and `opacity` for animations
- Avoid animating `width`, `height`, `top`, `left`
- Use `will-change` for elements that will animate
- Remove transitions during active drag/resize

**Memory Management:**
```typescript
// Efficient layout updates
const handleLayoutChange = useCallback(
  debounce((layout, layouts) => {
    setLayouts(layouts);
    // Persist to localStorage/backend
    saveLayoutPreferences(layouts);
  }, 300),
  []
);
```

### Large Dataset Handling

**Virtual Scrolling for Large Widgets:**
```jsx
// For widgets with 100+ items
<VirtualizedList
  height={widgetHeight - headerHeight}
  itemCount={items.length}
  itemSize={itemHeight}
  renderItem={({ index, style }) => (
    <div style={style}>
      <ActivityItem data={items[index]} />
    </div>
  )}
/>
```

**Progressive Loading:**
- Load initial 20 items
- Load more on scroll
- Show loading skeleton for pending items

## Accessibility Requirements

### Keyboard Navigation

**Tab Order:**
1. Widget header (focusable for keyboard drag)
2. Size menu button
3. Interactive content within widget
4. Next widget

**Keyboard Shortcuts:**
- **Arrow Keys**: Move widget position (when focused)
- **+/-**: Increase/decrease widget size
- **Enter**: Open widget options menu
- **Escape**: Cancel drag operation

**Screen Reader Support:**
```jsx
<div 
  role="region"
  aria-label={`${title} widget`}
  aria-describedby={`${id}-description`}
  tabIndex={0}
>
  <div id={`${id}-description`} className="sr-only">
    {title} widget. Use arrow keys to move, plus/minus to resize.
  </div>
  {/* Widget content */}
</div>
```

### Focus Management

**Drag Focus:**
- Maintain focus on widget during drag
- Announce position changes to screen readers
- Clear focus indicators during drag

**Resize Focus:**
- Focus size menu when opened
- Announce size changes
- Return focus to widget after resize

## Widget Content Guidelines

### Data Visualization

**Chart Widgets:**
- **Minimum Size**: Medium (2x2)
- **Recommended**: Large (3x2) or Huge (4x3)
- **Responsive**: Adjust chart complexity based on size
- **Interaction**: Hover tooltips, click to drill down

**Table Widgets:**
- **Minimum Size**: Medium (2x2)
- **Small Mode**: Show 3-5 critical columns
- **Large Mode**: Show all columns with horizontal scroll
- **Huge Mode**: Show all columns + filters/search

### Status Indicators

**System Status:**
- **Tiny**: Overall status icon only
- **Small**: Status + count
- **Medium**: Status list with details
- **Large**: Status + trends + actions

**Performance Metrics:**
- **Tiny**: Single KPI
- **Small**: KPI + trend
- **Medium**: Multiple KPIs
- **Large**: KPIs + charts + comparisons

## Size Preset Specifications

### Dimensions

| Size | Grid Units | Pixels (approx) | Use Case |
|------|------------|-----------------|----------|
| **Tiny** | 1x1 | 136x136 | Single metric, status icon |
| **Small** | 2x1 | 288x136 | KPI with trend, compact status |
| **Medium** | 3x2 | 440x288 | Standard widget, lists, charts |
| **Large** | 4x3 | 592x424 | Detailed content, tables, extended analytics |
| **Huge** | 6x4 | 880x544 | Complex visualizations, comprehensive dashboards |

### Content Adaptation Rules

**Stats Widget Sizes:**
- **Tiny**: Icon + value only (centered layout)
- **Small**: Icon + value + trend arrow (horizontal layout)
- **Medium**: Icon + value + trend + description (standard layout)
- **Large**: Large icon + value + trend + monthly/quarterly stats
- **Huge**: Massive icon + value + trend + description + comprehensive analytics (monthly, quarterly, yearly)

**Activity Widget Sizes:**
- **Medium**: 4 recent items
- **Large**: 8 items + "View All" link
- **Huge**: 12+ items + search + filters

**Status Widget Sizes:**
- **Small**: 3 critical status items
- **Medium**: 6 status items with details
- **Large**: All status items + actions
- **Huge**: Status + trends + historical data

## Widget Persistence System

### Database Schema

**User Widget Layouts Table:**
```sql
CREATE TABLE user_widget_layouts (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  widget_id VARCHAR(100) NOT NULL,
  widget_type VARCHAR(50) NOT NULL,
  layout_config JSON NOT NULL,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_widget (user_id, widget_id)
);
```

**Default Widget Templates Table:**
```sql
CREATE TABLE default_widget_templates (
  id VARCHAR(36) PRIMARY KEY,
  widget_id VARCHAR(100) NOT NULL UNIQUE,
  widget_type VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  default_config JSON NOT NULL,
  available_sizes JSON NOT NULL,
  required_permissions JSON,
  is_active BOOLEAN NOT NULL DEFAULT true,
  default_order INTEGER NOT NULL DEFAULT 0
);
```

### Layout Configuration Structure

```typescript
interface LayoutConfig {
  position: {
    x: number;        // Grid column position
    y: number;        // Grid row position  
    w: number;        // Width in grid units
    h: number;        // Height in grid units
  };
  size: WidgetSize;   // Current size preset
  [key: string]: any; // Widget-specific configuration
}
```

### Persistence Flow

1. **User Login**: Load saved widget layouts from database
2. **Layout Changes**: Debounced save (1 second after user stops dragging)
3. **Size Changes**: Immediate save when user changes widget size
4. **Widget Visibility**: Save when user shows/hides widgets
5. **Reset Option**: Ability to reset to system defaults

## Widget Component Architecture

### Base Widget Structure

```jsx
interface WidgetProps {
  id: string;
  title: string;
  size: WidgetSize;
  availableSizes: WidgetSize[];
  onSizeChange: (size: WidgetSize) => void;
  className?: string;
  children: React.ReactNode;
}

const Widget: React.FC<WidgetProps> = ({
  id, title, size, availableSizes, onSizeChange, children
}) => {
  return (
    <div className={`widget widget-${size}`}>
      <WidgetHeader 
        title={title}
        size={size}
        availableSizes={availableSizes}
        onSizeChange={onSizeChange}
      />
      <WidgetContent size={size}>
        {children}
      </WidgetContent>
    </div>
  );
};
```

### Header Component

```jsx
const WidgetHeader: React.FC<HeaderProps> = ({
  title, size, availableSizes, onSizeChange
}) => {
  return (
    <div className="widget-header drag-handle">
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="widget-title">{title}</h3>
        <div className="flex items-center space-x-2">
          {availableSizes.length > 1 && (
            <SizeDropdown
              currentSize={size}
              availableSizes={availableSizes}
              onSizeChange={onSizeChange}
            />
          )}
          <WidgetOptionsMenu />
        </div>
      </div>
    </div>
  );
};
```

### Size Dropdown Component

```jsx
const SizeDropdown: React.FC<SizeDropdownProps> = ({
  currentSize, availableSizes, onSizeChange
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const sizeLabels = {
    tiny: 'Tiny',
    small: 'Small', 
    medium: 'Medium',
    large: 'Large',
    huge: 'Huge'
  };

  const sizeDimensions = {
    tiny: '1×1',
    small: '2×1',
    medium: '2×2', 
    large: '3×2',
    huge: '4×3'
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="widget-hamburger"
        aria-label="Resize widget"
      >
        <EllipsisVerticalIcon className="h-5 w-5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-600 z-50">
          {availableSizes.map(size => (
            <button
              key={size}
              onClick={() => {
                onSizeChange(size);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between ${
                currentSize === size ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400' : ''
              }`}
            >
              <span>{sizeLabels[size]}</span>
              <span className="text-xs text-gray-400">{sizeDimensions[size]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
```

## Scrolling & Overflow

### Content Scrolling

**Widget Content Scrolling:**
```css
.widget-content {
  height: calc(100% - 60px); /* Account for header */
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
}

.widget-content::-webkit-scrollbar {
  width: 6px;
}

.widget-content::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5);
  border-radius: 3px;
}
```

**Window Auto-Scroll During Drag:**
```javascript
const updateAutoScroll = (e: MouseEvent) => {
  const scrollThreshold = 80; // Pixels from window edge
  const scrollSpeed = 8; // Pixels per scroll step
  const scrollDelay = 500; // Brief delay before starting
  const mouseY = e.clientY; // Relative to viewport

  // Check if near window edges
  const shouldScrollUp = mouseY < scrollThreshold && window.scrollY > 0;
  const shouldScrollDown = mouseY > window.innerHeight - scrollThreshold;

  if (shouldScrollUp || shouldScrollDown) {
    // Start scrolling after delay
    setTimeout(() => {
      setInterval(() => {
        window.scrollBy(0, shouldScrollUp ? -scrollSpeed : scrollSpeed);
      }, 16);
    }, scrollDelay);
  }
};
```

**Scrolling Design:**
- **Widget Scrolling**: Individual widgets can scroll when content exceeds widget size
- **Window Auto-Scroll**: During drag, window scrolls when dragging near top/bottom edges
- **Brief Delay**: 500ms delay before auto-scroll starts for natural feel
- **Dual Context**: Both widget content and window scrolling work together

### Overflow Strategies

**Text Overflow:**
```css
/* Single line truncation */
.truncate-1 {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Multi-line truncation */
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

**Content Overflow:**
- **Fade Edges**: Gradient fade when content overflows
- **Show More**: Expandable sections for additional content
- **Pagination**: For large datasets
- **Virtual Scrolling**: For 100+ items

## Animation & Transitions

### Drag Animations

**Smooth Following:**
```css
/* Widget follows cursor exactly */
.widget.dragging {
  pointer-events: none;
  transform-origin: center;
  transition: none !important;
  z-index: 1000;
}

/* Other widgets animate out of the way */
.widget:not(.dragging) {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
```

**Drop Animation:**
```css
.widget.dropping {
  animation: dropSettle 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes dropSettle {
  0% { transform: scale(1.03); }
  50% { transform: scale(0.98); }
  100% { transform: scale(1); }
}
```

### Auto-Scroll During Drag

**Edge Detection:**
```typescript
const updateAutoScroll = (e: MouseEvent) => {
  const container = containerRef.current;
  const rect = container.getBoundingClientRect();
  const scrollThreshold = 50; // Pixels from edge
  const scrollSpeed = 5;      // Pixels per frame
  
  const mouseY = e.clientY; // Relative to viewport
  const windowHeight = window.innerHeight;
  const scrollDelay = 500; // Brief delay before starting
  
  // Check if near window edges
  const shouldScrollUp = mouseY < scrollThreshold && window.scrollY > 0;
  const shouldScrollDown = mouseY > windowHeight - scrollThreshold;
  
  if (shouldScrollUp || shouldScrollDown) {
    // Start scrolling after delay
    setTimeout(() => {
      setInterval(() => {
        if (shouldScrollUp && window.scrollY > 0) {
          window.scrollBy(0, -scrollSpeed);
        } else if (shouldScrollDown) {
          const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
          if (window.scrollY < maxScroll) {
            window.scrollBy(0, scrollSpeed);
          }
        }
      }, 16);
    }, scrollDelay);
  }
};
```

**Auto-Scroll Features:**
- **60fps Updates**: 16ms intervals for smooth window scrolling
- **Natural Browser Behavior**: Uses native `window.scrollBy()` for familiar feel
- **Brief Delay**: 500ms delay prevents accidental scrolling
- **Boundary Respect**: Stops at document scroll limits

### Resize Animations

**Size Transitions:**
```css
.widget.resizing {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.widget-content.size-changing {
  transition: all 0.3s ease;
}
```

**Content Morphing:**
```jsx
// Smooth content transitions between sizes
<AnimatePresence mode="wait">
  <motion.div
    key={size}
    initial={{ opacity: 0, scale: 0.9 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 1.1 }}
    transition={{ duration: 0.3 }}
  >
    {renderContentForSize(size)}
  </motion.div>
</AnimatePresence>
```

## User Experience Guidelines

### Visual Feedback

**Hover States:**
- **Header Hover**: Subtle background change
- **Drag Handle**: Visible grip indicator
- **Size Button**: Tooltip showing current size
- **Content Hover**: Interactive elements highlight

**Active States:**
- **Dragging**: Elevated shadow, slight scale
- **Resizing**: Pulsing border, size preview
- **Loading**: Skeleton animation
- **Error**: Red border, error icon

### Interaction Patterns

**Discoverability:**
- **Progressive Disclosure**: Show controls on hover
- **Visual Hints**: Subtle animations draw attention
- **Consistent Patterns**: Same interaction across all widgets
- **Help Tooltips**: Explain functionality on first use

**Error Prevention:**
- **Minimum Sizes**: Prevent widgets from becoming too small
- **Boundary Checking**: Prevent widgets from going off-screen
- **Collision Prevention**: Smart collision detection
- **Undo Support**: Ability to revert layout changes

## Testing Guidelines

### Widget Testing

**Unit Tests:**
```typescript
describe('StatsWidget', () => {
  it('adapts content to tiny size', () => {
    render(<StatsWidget size="tiny" {...props} />);
    expect(screen.queryByText('trend')).not.toBeInTheDocument();
    expect(screen.getByText(value)).toBeInTheDocument();
  });

  it('shows full content in medium size', () => {
    render(<StatsWidget size="medium" {...props} />);
    expect(screen.getByText('trend')).toBeInTheDocument();
    expect(screen.getByText('description')).toBeInTheDocument();
  });
});
```

**Interaction Tests:**
```typescript
describe('Widget Dragging', () => {
  it('follows cursor during drag', async () => {
    const { container } = render(<WidgetGrid {...props} />);
    const widget = container.querySelector('.widget');
    
    fireEvent.mouseDown(widget, { clientX: 100, clientY: 100 });
    fireEvent.mouseMove(widget, { clientX: 200, clientY: 200 });
    
    expect(widget.style.transform).toContain('translate(200px, 200px)');
  });
});
```

### Performance Tests

**Animation Performance:**
```javascript
// Measure FPS during drag operations
const measureDragPerformance = () => {
  let frameCount = 0;
  const startTime = performance.now();
  
  const countFrames = () => {
    frameCount++;
    if (performance.now() - startTime < 1000) {
      requestAnimationFrame(countFrames);
    } else {
      console.log(`FPS: ${frameCount}`); // Should be ~60
    }
  };
  
  requestAnimationFrame(countFrames);
};
```

## Implementation Checklist

### Widget System Requirements

- [ ] Drag only by header area
- [ ] Widget follows cursor exactly during drag
- [ ] Placeholder snaps to grid positions
- [ ] Size dropdown in hamburger menu
- [ ] Content adapts to selected size
- [ ] Smooth animations at 60fps
- [ ] Proper scrolling for overflow content
- [ ] Keyboard accessibility
- [ ] Screen reader support
- [ ] Touch device support
- [ ] Layout persistence
- [ ] Error handling and recovery

### Quality Standards

- [ ] No layout shifts during interactions
- [ ] Consistent animation timing
- [ ] Proper focus management
- [ ] Responsive on all screen sizes
- [ ] Dark mode support
- [ ] Performance monitoring
- [ ] Accessibility compliance
- [ ] Cross-browser compatibility

This widget system will provide a best-in-class dashboard experience that surpasses competitor offerings through superior interaction design and technical implementation.
