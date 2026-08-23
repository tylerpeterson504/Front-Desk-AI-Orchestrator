-- Demo user seed data
-- Password: password123 (bcrypt hashed)
INSERT INTO users (email, password, name, role) VALUES
('demo@example.com', '$2b$10$YIjlrPNoS8S.Vu7VN.p5gec6VTiPRKJt8Jq1o5n8C8cM3Ql3mEHmq', 'Demo Agent', 'agent');

-- Your properties
INSERT INTO properties (user_id, name, url_pattern, wifi_ssid, wifi_password, checkout_time, tone_guidelines) VALUES
(1, 'St.Pierre Hotel', 'stpierre', 'StPierre-Guest', 'guest123', '11:00:00', 'Professional, formal, courteous'),
(1, 'Andrew Jackson Hotel', 'andrewjackson', 'AndrewJackson-Guest', 'guest456', '11:00:00', 'Friendly, welcoming, professional');

-- Demo templates
INSERT INTO templates (user_id, name, category, content, tags) VALUES
(1, 'Welcome Greeting', 'greeting', 'Welcome to our hotel! We are delighted to have you. If you need anything, please call front desk.', ARRAY['greeting', 'welcome']),
(1, 'WiFi Info', 'amenity_info', 'Your WiFi network name is in your room. Password is in your welcome packet.', ARRAY['wifi', 'internet']),
(1, 'Checkout Reminder', 'checkout', 'Checkout is at 11:00 AM. For late checkout, please contact front desk.', ARRAY['checkout', 'time']),
(1, 'Room Service', 'amenity_info', 'Room service is available 6 AM to 11 PM. Press 0 from your room phone.', ARRAY['room service', 'dining']),
(1, 'Apology', 'issue_resolution', 'We sincerely apologize for the inconvenience. How can we help make your stay better?', ARRAY['apology', 'issue']),
(1, 'Pool Hours', 'amenity_info', 'Pool is open 8 AM to 9 PM daily. Room key provides access.', ARRAY['pool', 'recreation']),
(1, 'Breakfast', 'amenity_info', 'Complimentary breakfast 6:30 AM to 9:30 AM daily in the dining area.', ARRAY['breakfast', 'dining']),
(1, 'Gym Access', 'amenity_info', 'Fitness center on 2nd floor, 24/7 access with room key.', ARRAY['gym', 'fitness']),
(1, 'Late Checkout', 'special_request', 'We are happy to accommodate late checkout if available. Contact front desk.', ARRAY['checkout', 'special request']),
(1, 'Thank You', 'checkout', 'Thank you for staying with us. We hope to see you again!', ARRAY['goodbye', 'checkout']);

-- Demo shift notes
INSERT INTO shift_notes (user_id, property_id, content) VALUES
(1, 1, 'Elevator maintenance scheduled 2-4 PM'),
(1, 1, 'Conference room A fully booked'),
(1, 2, 'Pool cleaning at 3 PM - temporarily closed'),
(1, 2, 'VIP guest in room 201 - provide extra amenities');
