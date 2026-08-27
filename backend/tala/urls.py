from django.contrib import admin
from django.urls import include, path
from rest_framework_simplejwt.views import TokenRefreshView
from recovery.auth_views import TalaTokenObtainPairView, CurrentUserView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/login/", TalaTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/me/", CurrentUserView.as_view(), name="current_user"),
    path("api/", include("recovery.urls")),
]
