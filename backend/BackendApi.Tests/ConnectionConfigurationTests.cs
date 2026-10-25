using BackendApi.Data;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace BackendApi.Tests;

public sealed class ConnectionConfigurationTests
{
    private const string Connection =
        "Data Source=SERVER;Initial Catalog=ACQMN01;User ID=userAcquire;Password=secret;Encrypt=True;TrustServerCertificate=True;";

    private static IConfiguration Configure(params (string Key, string? Value)[] settings) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(
                settings.Select(setting => new KeyValuePair<string, string?>(setting.Key, setting.Value))
                    .Append(new("ConnectionStrings:DefaultConnection", Connection)))
            .Build();

    [Fact]
    public void ProductionSettingsUseTheSqlLogin()
    {
        // appsettings.json alone is what IIS (Production) reads. Windows
        // authentication there means the computer account: error 18456.
        var configuration = new ConfigurationBuilder()
            .AddJsonFile(Path.Combine(AppContext.BaseDirectory, "appsettings.json"), optional: false)
            .Build();

        var builder = new SqlConnectionStringBuilder(configuration.GetCoreDescrDataConnectionString());

        Assert.False(builder.IntegratedSecurity);
        Assert.Equal("userAcquire", builder.UserID);
        Assert.True(builder.Encrypt == SqlConnectionEncryptOption.Mandatory);
    }

    [Fact]
    public void WindowsAuthenticationOffKeepsTheSqlLogin()
    {
        var builder = new SqlConnectionStringBuilder(
            Configure(("CoreDescrData:UseWindowsAuthentication", "false")).GetCoreDescrDataConnectionString());

        Assert.False(builder.IntegratedSecurity);
        Assert.Equal("userAcquire", builder.UserID);
        Assert.Equal("secret", builder.Password);
        Assert.Equal("SERVER", builder.DataSource);
        Assert.Equal("ACQMN01", builder.InitialCatalog);
        Assert.True(builder.TrustServerCertificate);
    }

    [Fact]
    public void WindowsAuthenticationOnDropsTheSqlLogin()
    {
        var builder = new SqlConnectionStringBuilder(
            Configure(("CoreDescrData:UseWindowsAuthentication", "true")).GetCoreDescrDataConnectionString());

        Assert.True(builder.IntegratedSecurity);
        Assert.Equal("", builder.UserID);
        Assert.Equal("", builder.Password);
    }

    [Fact]
    public void DescribeConnectionNeverIncludesThePassword()
    {
        var description = BackendApi.Data.ConfigurationExtensions.DescribeConnection(Connection);

        Assert.Equal("SERVER/ACQMN01, SQL login userAcquire", description);
        Assert.DoesNotContain("secret", description);
    }
}
