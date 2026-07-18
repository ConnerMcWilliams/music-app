from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("users.urls")),
    path("api/", include("studies.urls")),
    path("api/", include("grading.urls")),
    path("api/", include("progress.urls")),
    path("api/", include("waitlist.urls")),
    path("api/", include("contact.urls")),
]

# In development, serve uploaded submission audio from MEDIA_ROOT. In production
# this is handled by the object-storage/CDN layer, not Django.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
