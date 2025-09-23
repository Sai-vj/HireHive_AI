def login_view(request):
    if request.method == "POST":
        username = request.POST.get("username")
        password = request.POST.get("password")
        user = authenticate(request, username=username, password=password)
        if user:
            login(request, user)
            messages.success(request, "Login successful")
            return redirect("home")   # go to home
        else:
            messages.error(request, "Invalid username or password")
    return render(request, "login.html")
