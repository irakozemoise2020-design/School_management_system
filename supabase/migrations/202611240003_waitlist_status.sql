-- Phase 2 (1/2): adds the "waitlisted" admission status. Run this file on its own, then run 0004.
alter type public.application_status add value if not exists 'waitlisted';
