# FreshFetch v4 — Multi-File Structure

## 📁 Folder Structure

```
freshfetch/
│
├── index.html                  ← Landing page (Farmer / Buyer buttons + hidden Admin icon)
│
├── images/
│   ├── hero-bg.jpg             ← ⚠️ YOUR BACKGROUND IMAGE GOES HERE
│   └── logo.png                ← Your FreshFetch logo
│
├── css/
│   └── style.css               ← All styles (shared across all pages)
│
├── js/
│   └── app.js                  ← Shared JS: Supabase, auth helpers, chat, utilities
│
└── pages/
    ├── buyer-login.html
    ├── buyer-signup.html
    ├── buyer-dashboard.html    ← Has "Status" tab (WhatsApp-style farmer statuses)
    │
    ├── farmer-login.html
    ├── farmer-signup.html
    ├── farmer-dashboard.html   ← Has "My Status" tab (upload harvest photos)
    │
    ├── admin-login.html
    ├── admin-signup.html
    └── admin-dashboard.html   ← Has "Statuses" tab to moderate farmer statuses
```

---

## 🖼️ Your Background Image

Save your hero image as:

    freshfetch/images/hero-bg.jpg

That's it. The landing page (`index.html`) will automatically use it as the background.
The overlay darkens it slightly so the text remains readable.

---

## 🗄️ New Supabase Table Required

The Status feature needs one new table. Run this SQL in your Supabase SQL Editor:

```sql
create table farmer_statuses (
  id uuid default gen_random_uuid() primary key,
  farmer_id uuid references profiles(id) on delete cascade not null,
  image_url text,
  caption text,
  created_at timestamptz default now() not null
);

-- Allow farmers to insert their own statuses
alter table farmer_statuses enable row level security;

create policy "Farmers can insert own statuses"
  on farmer_statuses for insert
  with check (auth.uid() = farmer_id);

create policy "Anyone can view statuses"
  on farmer_statuses for select
  using (true);

create policy "Farmers can delete own statuses"
  on farmer_statuses for delete
  using (auth.uid() = farmer_id);
```

Also create a storage bucket called `farmer-statuses` in Supabase Storage
and set it to **Public**.

---

## ✨ What's New in v4

### 🟢 Buyer — Status Tab
- WhatsApp-style circular farmer avatars at the top
- Tap a farmer ring → fullscreen status viewer opens
- Progress bar at top counts down per photo (5 seconds each)
- Tap left/right to navigate between a farmer's multiple statuses
- Grid preview of all recent updates below the rings

### 📸 Farmer — My Status Tab
- Upload a harvest photo with an optional caption
- Statuses are live for 24 hours then expire automatically
- Can see and delete their own past statuses
- Home dashboard now shows a "Status Updates" stat card

### 🔐 Admin
- New "Statuses" tab to view and remove any farmer status
- Admin login icon is now a tiny 🔐 in the bottom-right corner of the landing page (hidden from regular users)

---

## 🚀 How to Run

Just open `index.html` in your browser or use VS Code Live Server.
No npm, no build tools needed.
