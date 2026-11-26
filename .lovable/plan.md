# Interview Studio

## Goal
Build a warm, encouraging practice-interview app for job seekers. An AI interviewer asks role-specific questions and gives useful feedback.

## What to build
- Replace the blank home page with an interview setup and practice workspace.
- Let a job seeker enter a role and optional job description, then start a five-question text interview.
- Ask the opening question, continue the conversation after each answer, and show a constructive feedback summary when complete.
- Keep each session temporary; sign-in and saved interview history were not requested.
- Apply a warm, encouraging visual direction and add page-specific metadata.

## Technical details
- Use Lovable Cloud server functions and the Lovable AI Gateway for interview questions and feedback; keep AI calls on the server.
- Keep interview state in the active browser session. No database tables or sign-in flow are needed for this first version.
- Add a small test for the five-question completion rule, then verify the live practice flow and responsive layout.