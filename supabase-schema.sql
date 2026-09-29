-- =====================================================
-- Supabase Schema for Campus Clubs Portal
-- Run this in your Supabase SQL Editor:
-- Dashboard -> SQL Editor -> New Query -> Paste & Run
-- =====================================================

-- 1. Create Clubs Table
CREATE TABLE IF NOT EXISTS public.clubs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    club_head TEXT,
    mission TEXT,
    about_club TEXT,
    joining_procedure TEXT,
    contact TEXT,
    logo_url TEXT,
    achievements JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Config Table for Admin Passwords
CREATE TABLE IF NOT EXISTS public.config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL
);

-- Insert default admin passwords (A1: Admin@1, A2: admin2)
INSERT INTO public.config (key, value)
VALUES ('passwords', '{"a1": "Admin@1", "a2": "admin2"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 3. Enable Row Level Security (RLS) with Public Read & Write policies
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;

-- Allow public read and write for clubs
CREATE POLICY "Allow public read on clubs" ON public.clubs FOR SELECT USING (true);
CREATE POLICY "Allow public insert on clubs" ON public.clubs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on clubs" ON public.clubs FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on clubs" ON public.clubs FOR DELETE USING (true);

-- Allow public read and write on config
CREATE POLICY "Allow public read on config" ON public.config FOR SELECT USING (true);
CREATE POLICY "Allow public update on config" ON public.config FOR UPDATE USING (true);
CREATE POLICY "Allow public insert on config" ON public.config FOR INSERT WITH CHECK (true);

-- Enable Realtime for clubs table
ALTER PUBLICATION supabase_realtime ADD TABLE public.clubs;

-- =====================================================
-- Storage Bucket Instructions:
-- In Supabase Dashboard -> Storage -> Create New Bucket:
-- 1. Name: 'club-assets'
-- 2. Toggle 'Public bucket' to ON
-- 3. Save!
-- =====================================================
