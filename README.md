<h>Project info: BookingTable, Group 65 </h><br/>
   Wong Sin Lam 13689715<br/>
   Wong Sum Yin 13703382<br/>
Project file intro: - <br/>
server.js: provided login function using facebook<br/>
package.json: lists of dependencies (express,passport,passport-facebook ,mongodb ,dotenv ,ejs)<br/>
views:login.ejs,create.ejs,list.ejs,details.ejs,edit.ejs,info.ejs <br/>

The cloud-based server URL for testing: <br/>
https://three81project-group65.onrender.com<br/>
Operation guides for your server<br/>
Login/Logout:<br/>
1.click "Login through Facebook" button to login to the /content page<br/>
2.click Logout to logout and back to the login page<br/>
CRUD web pages:<br/>
create<br/>
1.in content page-> press Create a New Booking-> Choose Date Time Table and input ur phone number->press Book Table button(you can cancel if you want)-->Done<br/>
details and edit<br/>
<br/>
1.in content page-> press Details button from the booking you wanna to access-> press edit button-->Choose Date Time Table and input ur phone number---->press Update Booking button(you can cancel if you want)-----> if the table was not booked yet , your edit will be successfuly done. Else a dialog will shown that's tell you you are not allowed to book the booked table
delete<br/>
1.in content page-> press Details button from the booking you wanna to access-> press delete button--> if the table was  booked by you , your delete will be  successfuly done. Else a dialog will shown that's tell you you are not allowed to delete the booked table<br/>
RESTful CRUD Services<br/>
List of APIs:<br/>
   Get Availability:<br/>
      HTTP Request Type: GET<br/>
      Path URI: /api/availability<br/>
      Parameters: date and time (in the query string).<br/>
   Create Booking:<br/>
      HTTP Request Type: POST<br/>
      Path URI: /api/bookings<br/>
      Body Parameters: date, time, tableNumber, phone_number.<br/>

   Get Bookings:<br/>
      HTTP Request Type: GET<br/>
      Path URI: /api/bookings<br/>

   Update Booking:<br/>
      HTTP Request Type: PUT<br/>
      Path URI: /api/bookings/:id<br/>
      Body Parameters: Fields to update (date, time, tableNumber, phone_number).<br/>

   Delete Booking:<br/>
      HTTP Request Type: DELETE<br/>
      Path URI: /api/bookings/:id<br/>

cURL Testing Commands:<br/>
Check Availability:<br/>
curl -X GET "https://three81project-group65.onrender.com/api/availability?date=2024-12-01&time=18:00"

<br/>Create a new booking:<br/>
curl -X POST "https://three81project-group65.onrender.com/api/bookings" -F"date=2024-11-24" -F"time=10:00" -F"tableNumber=1" -F"phone_number=12345678"
<br/>Update an Existing Booking:<br/>
curl -X PUT "https://three81project-group65.onrender.com/api/bookings/"booking_id"" -F"date=2024-11-24" -F"time=10:00" -F"tableNumber=1" -F"phone_number=12345678"
   
<br/>Delete a Booking:<br/>
curl -X DELETE https://three81project-group65.onrender.com/api/bookings/"booking_id"

