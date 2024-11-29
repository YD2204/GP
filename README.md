Project info: BookingTable, Group 65 
   Wong Sin Lam 13689715
                13703382
Project file intro: - 
server.js: provided login function using facebook
package.json: lists of dependencies (express,passport,passport-facebook ,mongodb ,dotenv ,ejs)
views:login.ejs,create.ejs,list.ejs,details.ejs,edit.ejs,info.ejs 

The cloud-based server URL for testing: 
https://three81project-group65.onrender.com
Operation guides for your server
Login/Logout:
1.click "Login through Facebook" button to login to the /content page
2.click Logout to logout and back to the login page
CRUD web pages:
create
1.in content page-> press Create a New Booking-> Choose Date Time Table and input ur phone number->press Book Table button(you can cancel if you want)-->Done
details and edit
1.in content page-> press Details button from the booking you wanna to access-> press edit button-->Choose Date Time Table and input ur phone number---->press Update Booking button(you can cancel if you want)-----> if the table was not booked yet , your edit will be successfuly done. Else a dialog will shown that's tell you you are not allowed to book the booked table
delete
1.in content page-> press Details button from the booking you wanna to access-> press delete button--> if the table was  booked by you , your delete will be  successfuly done. Else a dialog will shown that's tell you you are not allowed to delete the booked table
RESTful CRUD Services
List of APIs:
   Get Availability:
      HTTP Request Type: GET
      Path URI: /api/availability
      Parameters: date and time (in the query string).
   Create Booking:
      HTTP Request Type: POST
      Path URI: /api/bookings
      Body Parameters: date, time, tableNumber, phone_number.

   Get Bookings:
      HTTP Request Type: GET
      Path URI: /api/bookings

   Update Booking:
      HTTP Request Type: PUT
      Path URI: /api/bookings/:id
      Body Parameters: Fields to update (date, time, tableNumber, phone_number).

   Delete Booking:
      HTTP Request Type: DELETE
      Path URI: /api/bookings/:id

cURL Testing Commands:
Check Availability:
curl -X GET "https://three81project-group65.onrender.com/api/availability?date=2024-12-01&time=18:00"

Create a new booking:
curl -X POST https://three81project-group65.onrender.com/api/bookings \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "date=2024-12-01" \
     -d "time=18:00" \
     -d "tableNumber=5" \
     -d "phone_number=1234567890" 

Update an Existing Booking:
curl -X PUT https://three81project-group65.onrender.com/api/bookings/"booking_id"/
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "date=2024-12-02" \
     -d "time=20:00" \
     -d "tableNumber=6" \
     -d "phone_number=0987654321" 
Delete a Booking:
curl -X DELETE https://three81project-group65.onrender.com/api/bookings/"booking_id"

