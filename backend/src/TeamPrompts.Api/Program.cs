using System.Text.Json.Serialization;
using Hangfire;
using Hangfire.PostgreSql;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Identity;
using Serilog;
using Scalar.AspNetCore;
using TeamPrompts.Api.Auth;
using TeamPrompts.Api.Common;
using TeamPrompts.Api.Jobs;
using TeamPrompts.Api.Realtime;
using TeamPrompts.Api.Startup;
using TeamPrompts.Application;
using TeamPrompts.Application.Abstractions;
using TeamPrompts.Infrastructure;
using TeamPrompts.Infrastructure.Identity;
using TeamPrompts.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog((ctx, cfg) => cfg
    .ReadFrom.Configuration(ctx.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .WriteTo.File("logs/teamprompts-.log", rollingInterval: RollingInterval.Day, retainedFileCountLimit: 7));

var config = builder.Configuration;
var connectionString = config.GetConnectionString("Default")
    ?? throw new InvalidOperationException("ConnectionStrings:Default is required.");
var openRouterBaseUrl = config["OpenRouter:BaseUrl"] ?? "https://openrouter.ai/api/v1";

// ---- Application + Infrastructure ----
builder.Services.AddApplication();
builder.Services.AddInfrastructure(connectionString, openRouterBaseUrl);

// ---- Data Protection (encrypts the OpenRouter API key at rest) ----
var keyRingPath = config["DataProtection:KeyRingPath"];
if (string.IsNullOrWhiteSpace(keyRingPath))
    keyRingPath = Path.Combine(builder.Environment.ContentRootPath, "keys");
Directory.CreateDirectory(keyRingPath);
builder.Services.AddDataProtection()
    .SetApplicationName("TeamPrompts")
    .PersistKeysToFileSystem(new DirectoryInfo(keyRingPath));

// ---- Identity (email login, cookie auth) ----
builder.Services.AddIdentity<AppUser, IdentityRole>(o =>
    {
        o.User.RequireUniqueEmail = true;
        o.Password.RequiredLength = 6;
        o.SignIn.RequireConfirmedAccount = false;
    })
    .AddEntityFrameworkStores<AppDbContext>()
    .AddDefaultTokenProviders();

builder.Services.ConfigureApplicationCookie(o =>
{
    o.Cookie.Name = "tp.auth";
    o.Cookie.HttpOnly = true;
    o.Cookie.SameSite = SameSiteMode.Lax;
    o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
    o.ExpireTimeSpan = TimeSpan.FromDays(7);
    o.SlidingExpiration = true;
    // API semantics: return status codes instead of redirecting to login pages.
    o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; };
    o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; };
});

builder.Services.AddAuthorization(o =>
    o.AddPolicy("Admin", p => p.RequireRole(AppRoles.Admin)));

// ---- App-specific services ----
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddScoped<IGenerationNotifier, SignalRGenerationNotifier>();
builder.Services.AddSingleton<IJobScheduler, HangfireJobScheduler>();
builder.Services.AddTransient<GenerationJob>();

// Startup check: warn (don't crash) if the configured default model isn't in OpenRouter's /models.
builder.Services.AddHostedService<ModelValidationHostedService>();

// ---- SignalR (string enums on the wire) ----
builder.Services.AddSignalR()
    .AddJsonProtocol(o => o.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// ---- Hangfire on PostgreSQL ----
builder.Services.AddHangfire(cfg => cfg
    .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
    .UseSimpleAssemblyNameTypeSerializer()
    .UseRecommendedSerializerSettings()
    .UsePostgreSqlStorage(o => o.UseNpgsqlConnection(connectionString)));
builder.Services.AddHangfireServer();

// ---- MVC + validation + JSON ----
builder.Services.AddControllers(o => o.Filters.Add<ValidationActionFilter>())
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = 25 * 1024 * 1024);

// ---- CORS (dev: FE on a different origin; prod: same origin via Caddy) ----
var origins = (config["Cors:AllowedOrigins"] ?? "http://localhost:3000,http://localhost")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
builder.Services.AddCors(o => o.AddPolicy("frontend", p =>
    p.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

// ---- OpenAPI + problem details ----
// Emit 3.0 (not the .NET 10 default 3.1) so orval generates correct react-query hooks.
// (The 3.0 writer omits `type` on int/enum schemas — the frontend's orval transformer restores it.)
builder.Services.AddOpenApi(o => o.OpenApiVersion = Microsoft.OpenApi.OpenApiSpecVersion.OpenApi3_0);
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();

var app = builder.Build();

app.UseExceptionHandler();
app.UseSerilogRequestLogging();

app.MapOpenApi();
app.MapScalarApiReference();

app.UseCors("frontend");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHub<GenerationHub>("/api/hubs/generation");
app.MapHangfireDashboard("/hangfire", new DashboardOptions
{
    Authorization = [new HangfireAdminAuthorizationFilter()],
});
app.MapGet("/health", () => Results.Ok(new { status = "ok" })).AllowAnonymous();

// ---- Migrate + seed on startup ----
await DataSeeder.SeedAsync(app.Services, config["Seed:AdminEmail"] ?? "", config["Seed:AdminPassword"] ?? "");

app.Run();
