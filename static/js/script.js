
var localaddress = "http://127.0.0.1:5000";
function validateSignup(){
    var pass = document.getElementById("pass").value;
    var passConf = document.getElementById("confpass").value;
    if(pass == passConf){
        return true;
    }
    else{
        document.getElementById('passNotMatchingMsg').value = 'The password and confirmation do not match. Please try again.'
        alert("Password and confirmation do not match");
    }
}

