from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_wtf.csrf import CSRFProtect

application = Flask (__name__)
application.config['SECRET_KEY'] = "as0k59r878lnkl"

aws_uri=f"mysql+pymysql://{'admin'}:{'SoccerPlayer7!'}@{'swolltech-db.cxkpf5rcmqhr.us-east-1.rds.amazonaws.com'}:{3306}/{'swolltech'}"
application.config['SQLALCHEMY_DATABASE_URI'] = aws_uri
db = SQLAlchemy(application)

csrf = CSRFProtect(application)


from app.routes import routes

application.register_blueprint(routes)

