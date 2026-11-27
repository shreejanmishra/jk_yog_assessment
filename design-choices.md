# Design Choices

## Notes

- Since the dates on which the festival was supposed to happen was in November, I have moved the event to December with the same dates.
- I am using a simulated payment gateway, not actual stripe. Please don't be alarmed to see a simulate decline button in the make payment modal.
- The page felt empty with just the event details so I have added mock sections like 'About us', 'Our Mission', ' Contribute to the Cause', a junk footer and mock 'Profile' drowdown.
- I do not have my own DNS, so I have a simulated email output containing the pass and invoice as attachment.
- I am not adding a refund workflow, date change for existing booking or an admin panel.
- Expect slight latency with backend if the evaluator is situated in North America, since the DB server region is Singapore. 

## The Rules

### Bookings

The booking is divided into two parts: Individual and Group mode.

#### Individual Mode

The individual mode will work like any normal form except for one catch, i.e, during the form filling, if age entered is less than 18, booking cannot be made, the website will disable the booking button (this rule is valid both through UI and backend).

#### Group Mode

Group mode will work like individual mode for the booker in case he checks out the "I am also attending checkbox" or he can make the booking in someone elses name.

Group mode is further divided into three parts,

##### Adult Pass

Adult pass is further divided into two parts:

- **Adult pass:** The form is like the individual mode, nothing extra.
- **Minor pass:** Even though 12+ teens are treated as adults, I have given them a category of 'Minor', the form will also ask for Guardian details(name and phone number) which is mandatory and a button to auto-fill details of the booker in the guardian field.

##### Child Pass

Same form as minor.

##### Toddler Pass

No payment related addition.

#### Add-ons: Dinner Plates and Garba Workshops

Dinner Plates and Garba Workshops are only valid on dates covered by that attendee's pass, and Garba Workshop is restricted to '2026-12-11' and '2026-12-13' (ages '5+').

#### Stock Locking

Once the booker moves to the payment window, all the items that he has taken are locked for a period of 10 mins. If he books within this window, the stocks are appropriately deducted. Otherwise, the locked stock is released for other users. This is to prevent an abandoned checkout that might lock the scarce stock item from other users, for eg. the garba pass.

First come first serve is observed for stocks, if two bookers make the same item booking at the same time, the one that was fractionally faster will have the rights to the item during payment window and the item will be in hold for 10 mins or until the transaction is executed.

### Uniqueness of an Individual

- For adults and minors, I have used phone number as a unique field.
- For child and toddlers, I have used the combination of guardian's phone number and name of the child/toddler. Since a guardian can have multiple kids and locking out another entry with phone number would not be suitable.
- The guardian and child/toddler/minor cannot be the same individual. Guardian phone number and the childs number and name should not match. Scenario: In emergency, the guardian should be able to get contacted immediately and reliabaly.

### Coupons

- I have decided to limit the coupon usage to 1 per booker and all the attendies in the bookings to prevent coupon abuse. Scenario: An individual books a ticket for 2 and applies a coupon for booking, then he/one of the previously booked person comes again and makes another booking for 2 with new individuals and apllies the same coupon or other coupon while trying to maximize the discount.
- If a child doesn't exist in the booking, the coupon `KIDSFREE` wont be applicable.
- If the booking more than 40$, the `FLAT20` coupon is applicable, imagine a scene where the booking is for 15$ and `FLAT20` is applied.

## Tech Stack

| Layer             | Technologies                                                                 |
| ----------------- | ---------------------------------------------------------------------------- |
| Frontend          | React 19, TypeScript, Vite, React Router v6, Zustand, Tailwind CSS v4, Axios |
| Backend           | Node.js, Express 5, Zod, Helmet, Express Rate Limit                          |
| Database          | Neon PostgreSQL, Drizzle ORM, node-postgres (pg)                             |
| Documents & Media | PDFKit, QRCode                                                               |
| Testing & Quality | Vitest, fast-check, ESLint                                                   |
| Deployment        | Vercel (Serverless Functions & Cron Jobs)                                    |
