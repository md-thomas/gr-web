Readme for gr-web 

frontend 
- this is where the node stuff lives
- build the node stuff like this
    - npm run build
- run the web service to test the guil
    - npm run dev 

backend
- this is where the python backend stuff lives
- this will startup a flask web backend so you can connect to http://localhost:5050 to view the webpage 
    - python app.py 




start.sh
- builds the frontend if needed and starts the backend
    - ./start.sh          (default port 5050)
    - ./start.sh 8080     (custom port)
