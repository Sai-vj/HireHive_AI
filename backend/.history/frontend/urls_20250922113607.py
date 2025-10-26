from django.urls import path
from . import views



urlpatterns = [
    path("", views.home_page, name="home"),
    path("news/", views.news_list, name="news_list"),
    path("news/<int:pk>/", views.news_detail, name="news_detail"),
    path("contact/", views.contact_page, name="contact"),
    path("go-to-dashboard/", views.go_to_dashboard, name="go_to_dashboard"),
]
