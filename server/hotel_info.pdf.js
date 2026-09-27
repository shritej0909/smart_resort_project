// Embedded hotel knowledge base — replace this with real PDF parsing
// when you have a real PDF file. Drop your PDF at server/data/hotel_info.pdf
// and the RAG pipeline will parse it automatically via pdf-parse.
//
// This fallback text is used when no PDF is found.
export const HOTEL_INFO_TEXT = `
SMART RESORT 360 — COMPLETE GUEST GUIDE & REAL-TIME RESORT SERVICES INVENTORY

=== ABOUT THE RESORT ===
Smart Resort 360 is a luxury 5-star beachfront resort located in Goa, India.
We offer 150 rooms including Garden Rooms, Ocean Suites, and Private Pool Villas.
The resort spans 12 acres with lush tropical gardens, a private beach, and world-class luxury amenities.

=== RESORT SERVICES & AMENITIES LIVE CAPACITY INVENTORY ===

1. Serenity Spa (Ayurvedic & Swedish Therapies):
- Location: Wellness Pavilion, Ground Floor
- Hours: 9:00 AM – 8:00 PM daily
- Working Daily Capacity: 20 slots per day (60 to 90 minutes each)
- Current Real-Time Booked Slots: 19 / 20 (95% Capacity — Near Full Capacity)
- Available Working Slots: 1 slot remaining at 06:00 PM
- Treatments & Pricing:
  * 90-minute Relaxation Journey package: ₹4,500
  * Swedish Full-Body Massage (60 min): ₹3,800
  * Deep Tissue Ayurvedic Therapy (75 min): ₹4,200
  * Organic Radiance Facial: ₹3,200
- Recommended Alternative if Full (>=95% Capacity): Couples Spa Retreat, Sunset Yoga Deck, or Beachside Hydrotherapy Cabana.

2. Couple's Retreat & Hydrotherapy Suite:
- Location: Serenity Spa Suite 2
- Hours: 10:00 AM – 8:00 PM daily
- Working Daily Capacity: 8 private sessions per day (2 hours each)
- Current Real-Time Booked Slots: 5 / 8 (62% Capacity — Available)
- Available Working Slots: 3 slots available (02:00 PM, 04:30 PM, 06:30 PM)
- Pricing: ₹8,000 per couple (includes private jacuzzi, aromatic oil treatment & sparkling wine)

3. Sunset Yoga & Mindfulness Meditation Deck:
- Location: Beachside Oceanfront Deck
- Hours: Sunrise Session 07:00 AM – 08:00 AM; Sunset Session 05:30 PM – 06:30 PM
- Working Daily Capacity: 30 participants per session
- Current Real-Time Booked Slots: 14 / 30 (47% Capacity — Plenty of Availability)
- Available Working Slots: 16 spots open for today's 05:30 PM sunset session
- Pricing: Complimentary for all staying resort guests

4. The Palms Restaurant (Fine Dining & Chef's Tasting):
- Location: Central Courtyard
- Hours: Breakfast 7:00 AM – 10:30 AM | Lunch 12:00 PM – 3:00 PM | Dinner 7:00 PM – 10:30 PM
- Working Dinner Capacity: 40 indoor & veranda tables
- Current Real-Time Booked Slots: 38 / 40 tables (95% Capacity — Near Full Capacity)
- Available Working Slots: Only 2 late tables available at 09:30 PM
- Pricing: ₹3,500 per person for 5-course degustation menu; à la carte available
- Recommended Alternative if Full (>=95% Capacity): Beachside Bar & Grill or Gourmet In-Room Dining

5. Beachside Bar & Grill:
- Location: Private Beach Shore
- Hours: Open daily 11:00 AM – 11:00 PM
- Working Capacity: 50 open-air beachside tables & lounge pods
- Current Real-Time Booked Slots: 28 / 50 tables (56% Capacity — Good Availability)
- Available Working Slots: 22 tables open throughout afternoon and sunset
- Menu: Fresh local grilled seafood, woodfired pizzas, signature tropical cocktails

6. In-Room Dining (24/7 Room Service):
- Delivery: 24 Hours daily across all 150 resort rooms (30-minute delivery guarantee)
- Current Capacity: On-demand kitchen service running smoothly
- Order via Guest Portal or dial 0 from room phone

7. Infinity Pool Luxury Private Cabanas:
- Location: Cliffside Infinity Pool Deck
- Hours: 8:00 AM – 7:00 PM daily
- Working Daily Capacity: 12 VIP Day Cabanas
- Current Real-Time Booked Slots: 11 / 12 cabanas (92% Capacity — High Demand)
- Available Working Slots: 1 Cabana available (Cabana #7)
- Pricing: ₹2,500 per day (includes fresh fruit platter, chilled coconut water & dedicated butler)

8. Water Sports & Beach Adventure Desk:
- Location: Beach Activities Pavilion
- Hours: 8:00 AM – 5:00 PM daily
- Working Daily Capacity: 25 activity time slots per day
- Current Real-Time Booked Slots: 16 / 25 slots (64% Capacity — Available)
- Available Working Slots: 9 slots available (Jet-Ski at 02:00 PM, 03:00 PM, 04:00 PM; Parasailing at 03:30 PM; Kayaking open)
- Pricing: Parasailing ₹2,800, Jet-Ski ₹2,500 (30 min), Kayak ₹800/hr

9. PADI Scuba Diving Certification & Reef Excursions:
- Location: Dive Center & Marine Lagoon
- Hours: 9:00 AM – 4:00 PM daily
- Working Capacity: 10 divers per day
- Current Real-Time Booked Slots: 6 / 10 divers (60% Capacity — Available)
- Available Working Slots: 4 slots open for tomorrow's morning reef dive
- Pricing: ₹8,000 for 2-day certification; ₹4,500 for discovery fun dive

10. Private Fitness & Personal Training:
- Location: 2nd Floor Oceanview Gym
- Hours: Gym open 24 hours; Trainers on duty 6:00 AM – 9:00 PM
- Working Daily Capacity: 14 private 1-on-1 trainer slots
- Current Real-Time Booked Slots: 8 / 14 slots (57% Capacity — Available)
- Available Working Slots: 6 slots open (11:00 AM, 02:00 PM, 04:00 PM, 05:00 PM, 07:00 PM, 08:00 PM)
- Pricing: ₹2,000 / hour with certified master trainer

11. Executive Chef Masterclass & Cooking Workshop:
- Location: Open Culinary Theatre
- Hours: Every Thursday & Saturday 11:00 AM – 1:00 PM
- Working Capacity: 15 participants per workshop
- Current Real-Time Booked Slots: 15 / 15 (100% Capacity — Fully Booked / Sold Out)
- Available Working Slots: 0 slots open today (Waitlist open)
- Pricing: ₹3,500 per person
- Recommended Alternative: Chef's Table Dinner or Private Kitchen Tasting

12. Little Explorers Kids' Club & Babysitting:
- Location: Children's Activity Hub, Wing B
- Hours: Kids' Club 9:00 AM – 6:00 PM daily (Ages 4–12, Complimentary)
- Babysitting: 24 hours available on request (₹500/hour, 4-hour minimum)
- Working Capacity: 35 children
- Current Real-Time Booked Slots: 18 / 35 (51% Capacity — Open Availability)
- Available Working Slots: 17 slots available

13. Luxury Airport Chauffeur & City Transfers:
- Location: Resort Lobby Concierge Desk
- Hours: 24 Hours on demand
- Working Daily Capacity: 20 luxury sedan/SUV transfers
- Current Real-Time Booked Slots: 12 / 20 (60% Capacity — Available)
- Available Working Slots: 8 slots open today
- Pricing: Complimentary for Private Pool Villa guests; ₹2,500 for others

=== AI CONCIERGE RECOMMENDATION SYSTEM & REAL-TIME DISPATCH ===
- Real-Time Capacity Tracking: The AI Concierge continually monitors live capacity across all 13 resort services.
- Proactive Machine Learning Rule (95% Rule): If a guest inquires about or requests any resort service that is currently at 95% capacity or more, the AI Concierge informs the guest gently and proactively recommends the next available alternatives.

=== CHECK-IN / CHECK-OUT ===
- Check-in time: 2:00 PM
- Check-out time: 11:00 AM
- Early check-in: subject to availability (₹1,500 fee before 10:00 AM)
- Late check-out: subject to availability (₹2,000 fee until 4:00 PM, full-night charge after)
- Express checkout available via Guest Portal

=== ROOM INFORMATION ===
Garden Room (₹7,300/night):
- 35 sqm, garden or pool view
- King or twin bed configuration
- Amenities: AC, minibar, safe, 55" TV, high-speed WiFi

Ocean Suite (₹14,500/night):
- 65 sqm, direct ocean view
- King bed, separate living area
- Amenities: all Garden Room amenities + butler service, private balcony

Private Pool Villa (₹28,000/night):
- 150 sqm, private plunge pool
- Includes daily breakfast for 2, airport transfers, butler service

=== HOUSEKEEPING ===
- Daily turndown service included
- Request fresh towels, extra pillows, or room cleaning via Guest Portal
- Laundry service: drop bag before 9:00 AM for same-day return
- Dry cleaning available (24-hour turnaround)
- Do Not Disturb: use the physical sign or the Guest Portal toggle

=== CONTACT ===
- Front desk: Dial 0 from your room or use the Guest Portal
- Concierge: Dial 102 or use Guest Portal AI Concierge / Special Requests
- Medical emergency: Dial 999 (24-hour nurse on site, doctor on call)
- Emergency: Dial 112
`;
