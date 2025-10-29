# Development Guide - CLG-ADMIN

## Getting Started

### Initial Setup
```bash
# Clone the repository
git clone https://github.com/atoates/CLG-ADMIN.git
cd CLG-ADMIN

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Start development server
npm run dev
```

Visit http://localhost:5173

## Development Workflow

### Running Locally

1. **Start the backend** (CLG-DEPLOY on port 3000)
2. **Start the admin frontend** (this project on port 5173)
3. **Login** with your ADMIN_TOKEN

### Available Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Lint code
```

## Project Structure

```
src/
├── components/       # Reusable UI components
│   └── Layout.tsx    # Main sidebar layout
├── lib/             # Utilities and helpers
│   └── api.ts       # Axios API client
├── pages/           # Page components
│   ├── Dashboard.tsx    # Analytics dashboard
│   ├── Alerts.tsx       # Alerts management
│   ├── Users.tsx        # User management
│   ├── TokenRequests.tsx # Token request review
│   ├── AuditLog.tsx     # Audit log viewer
│   ├── Settings.tsx     # System settings
│   └── Login.tsx        # Admin login
├── store/           # State management
│   └── authStore.ts # Authentication state
├── App.tsx          # Main app with routing
└── main.tsx         # Entry point
```

## Building New Features

### Adding a New Page

1. Create page component in `src/pages/`
2. Add route in `src/App.tsx`
3. Add navigation link in `src/components/Layout.tsx`

Example:
```tsx
// src/pages/NewPage.tsx
export function NewPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold">New Page</h1>
    </div>
  )
}

// src/App.tsx
import { NewPage } from './pages/NewPage'
// Add to routes:
<Route path="/new-page" element={<NewPage />} />

// src/components/Layout.tsx
// Add to navigation array:
{ name: 'New Page', href: '/new-page', icon: YourIcon }
```

### Making API Calls

Use TanStack Query for server state:

```tsx
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'

// Fetch data
const { data, isLoading, error } = useQuery({
  queryKey: ['alerts'],
  queryFn: async () => {
    const { data } = await api.get('/api/alerts')
    return data
  },
})

// Mutate data
const mutation = useMutation({
  mutationFn: async (newAlert) => {
    const { data } = await api.post('/api/alerts', newAlert)
    return data
  },
  onSuccess: () => {
    // Invalidate and refetch
    queryClient.invalidateQueries({ queryKey: ['alerts'] })
  },
})
```

### Styling Components

Use Tailwind CSS utility classes:

```tsx
<div className="bg-white rounded-lg border border-gray-200 p-6">
  <h2 className="text-lg font-semibold text-gray-900 mb-4">Title</h2>
  <button className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg">
    Click Me
  </button>
</div>
```

## Next Features to Build

Based on the todo list, here are the priorities:

### 1. Alerts Management (High Priority)
**File:** `src/pages/Alerts.tsx`

Features needed:
- List all alerts with filters (severity, token, date)
- Create new alert form
- Edit existing alerts
- Delete alerts
- Bulk actions (delete multiple, change severity)
- CSV import/export
- Search functionality

**API Endpoints:**
- `GET /api/alerts` - List alerts
- `POST /api/alerts` - Create alert
- `PUT /api/alerts/:id` - Update alert
- `DELETE /api/alerts/:id` - Delete alert
- `POST /api/alerts/bulk` - Bulk import

### 2. Users Management
**File:** `src/pages/Users.tsx`

Features needed:
- List all users with pagination
- Search by name/email
- View user details (watchlist, activity)
- Export to CSV
- Filter by user type (Google vs anonymous)

**API Endpoints:**
- `GET /admin/users` - List users (already working!)
- `GET /admin/export/users.csv` - Export CSV

### 3. Token Requests Management
**File:** `src/pages/TokenRequests.tsx`

Features needed:
- List pending token requests
- Approve/reject workflow
- View request details (symbol, name, reason, website)
- Bulk approve/reject

**API Endpoints:**
- `GET /api/admin/token-requests` - List requests
- `PUT /api/admin/token-requests/:id` - Update status

### 4. Audit Log Viewer
**File:** `src/pages/AuditLog.tsx`

Features needed:
- Searchable log table
- Date range picker
- Filter by event type
- Filter by user
- Export to CSV

**API Endpoints:**
- `GET /api/admin/audit-log` - (needs to be created in backend)
- `GET /admin/export/audit.csv` - Export CSV (already exists!)

### 5. System Settings
**File:** `src/pages/Settings.tsx`

Features needed:
- View/manage environment variables
- Database statistics
- API key status indicators
- Feature flags
- Cache management

## Common Patterns

### Protected API Call
```tsx
const { data } = useQuery({
  queryKey: ['protected-data'],
  queryFn: async () => {
    const { data } = await api.get('/admin/protected-endpoint')
    return data
  },
})
```

### Form Handling
```tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  severity: z.enum(['critical', 'warning', 'info']),
})

type FormData = z.infer<typeof schema>

function MyForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = (data: FormData) => {
    console.log(data)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('title')} />
      {errors.title && <p>{errors.title.message}</p>}
      <button type="submit">Submit</button>
    </form>
  )
}
```

### Loading States
```tsx
if (isLoading) return <div>Loading...</div>
if (error) return <div>Error: {error.message}</div>
if (!data) return null

return <div>{/* Render data */}</div>
```

## Debugging Tips

1. **API not connecting?**
   - Check `.env` file has correct `VITE_API_URL`
   - Ensure backend is running
   - Check browser console for CORS errors

2. **Auth token not working?**
   - Check localStorage in DevTools
   - Verify token in backend `ADMIN_TOKEN` env var
   - Check Network tab for Authorization header

3. **Build errors?**
   - Run `npm install` to ensure all deps are installed
   - Check TypeScript errors: `npm run build`
   - Clear node_modules: `rm -rf node_modules && npm install`

## Git Workflow

```bash
# Create feature branch
git checkout -b feature/alerts-management

# Make changes and commit
git add .
git commit -m "Add alerts CRUD interface"

# Push to GitHub
git push origin feature/alerts-management

# Create Pull Request on GitHub
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for platform-specific deployment instructions.

## Resources

- [React Docs](https://react.dev)
- [TanStack Query](https://tanstack.com/query/latest)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [React Router](https://reactrouter.com)
- [Zustand](https://github.com/pmndrs/zustand)
