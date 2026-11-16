using BackendApi.Auth;
using BackendApi.Data;
using BackendApi.Repositories.DataViewer;
using BackendApi.Repositories.Drillholes;
using BackendApi.Repositories.TableConstants;
using BackendApi.Repositories.UploadData;
using Microsoft.AspNetCore.Authentication.Negotiate;
using Microsoft.AspNetCore.Authorization;

const string CorsPolicy = "FrontendCors";

var builder = WebApplication.CreateBuilder(args);

// ============================================
// Controllers and Swagger
// ============================================

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// ============================================
// Database Repositories
// ============================================

// Opens every SQL connection; runs it as the request's Windows user when
// Database:ImpersonateWindowsUser is on.
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<
    IDatabaseConnectionFactory,
    DatabaseConnectionFactory>();

builder.Services.AddScoped<
    IDrillholeRepository,
    DrillholeRepository>();

builder.Services.AddScoped<
    ITableConstantsRepository,
    TableConstantsRepository>();

builder.Services.AddScoped<
    IUploadDataRepository,
    UploadDataRepository>();

builder.Services.AddScoped<
    IDataViewerRepository,
    DataViewerRepository>();

// ============================================
// Windows Authentication
// ============================================

builder.Services
    .AddAuthentication(NegotiateDefaults.AuthenticationScheme)
    .AddNegotiate();

builder.Services.AddAuthorization();

// Every endpoint not marked [AllowAnonymous] (status) needs a Windows user when
// database calls run as that user, or when Auth:AllowedGroups limits the
// website to AD groups: anonymous calls get 401 + WWW-Authenticate: Negotiate,
// and a signed-in user in none of the groups gets 403. Read when the options
// are built, so test settings apply. See Auth/README.md.
builder.Services
    .AddOptions<AuthorizationOptions>()
    .Configure<IConfiguration>((options, configuration) =>
    {
        var allowedGroups = configuration.GetAllowedGroups();

        if (!configuration.ImpersonatesWindowsUser() && allowedGroups.Count == 0)
        {
            return;
        }

        var policy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser();

        if (allowedGroups.Count > 0)
        {
            policy.RequireAssertion(context => AllowedGroupAccess.IsAllowed(
                context.User,
                allowedGroups,
                (context.Resource as HttpContext)?.RequestServices
                    .GetService<ILoggerFactory>()?.CreateLogger(typeof(AllowedGroupAccess))));
        }

        options.FallbackPolicy = policy.Build();
    });

// ============================================
// CORS Configuration
// ============================================

builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicy, policy =>
    {
        policy
            .WithOrigins("http://10.27.27.140:5174")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

// ============================================
// Build Application
// ============================================

var app = builder.Build();

// Which login Upload Data and Data Viewer will use (no password is logged).
// Under IIS, Windows authentication means the computer account, e.g.
// BDOM\BMNDULAAS01$, which has no SQL login (error 18456).
try
{
    app.Logger.LogInformation(
        "Environment {Environment}; CoreDescrData connection: {Connection}; run as Windows user: {Impersonate}",
        app.Environment.EnvironmentName,
        BackendApi.Data.ConfigurationExtensions.DescribeConnection(app.Configuration.GetCoreDescrDataConnectionString()),
        app.Configuration.ImpersonatesWindowsUser());
}
catch (Exception exception) when (exception is InvalidOperationException or ArgumentException)
{
    app.Logger.LogError(exception, "The CoreDescrData connection string is missing or invalid.");
}

// Website access by AD group. Empty is fine for local development, but outside
// it every Windows user could use the website.
var allowedGroups = app.Configuration.GetAllowedGroups();

if (allowedGroups.Count > 0)
{
    app.Logger.LogInformation(
        "Website access limited to members of any of these AD groups: {AllowedGroups}",
        string.Join(", ", allowedGroups));
}
else if (app.Environment.IsDevelopment())
{
    app.Logger.LogWarning("{Key} is empty: AD group access check is off.", BackendApi.Data.ConfigurationExtensions.AllowedGroupsKey);
}
else
{
    app.Logger.LogError(
        "{Key} is empty: AD group access check is OFF, so any user can use the website. Add the allowed groups, e.g. [\"BDOM\\\\AcQuire_Uploaders\"].",
        BackendApi.Data.ConfigurationExtensions.AllowedGroupsKey);
}

// ============================================
// Swagger
// ============================================

app.UseSwagger();
app.UseSwaggerUI();

// ============================================
// HTTPS (Local Development Only)
// ============================================

if (app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

// ============================================
// Middleware
// ============================================

app.UseRouting();

app.UseCors(CorsPolicy);

app.UseAuthentication();
app.UseAuthorization();

// ============================================
// API Routes
// ============================================

app.MapControllers();

// ============================================
// Run Application
// ============================================

app.Run();